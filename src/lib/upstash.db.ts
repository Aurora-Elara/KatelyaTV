/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { Redis } from '@upstash/redis';

import { AdminConfig } from './admin.types';
import { hashPassword, verifyPassword } from './password';
import { calculateSourceHealthScore } from './source-health';
import {
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  SourceHealthMetric,
  SourceHealthScore,
  User,
  UserSettings,
} from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 添加Upstash Redis操作重试包装器
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        err.name === 'UpstashError';

      if (isConnectionError && !isLastAttempt) {
        console.log(
          `Upstash Redis operation failed, retrying... (${i + 1}/${maxRetries})`
        );
        console.error('Error:', err.message);

        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export class UpstashRedisStorage implements IStorage {
  private client: Redis;

  constructor() {
    this.client = getUpstashRedisClient();
  }

  // ---------- 播放记录 ----------
  private prKey(user: string, key: string) {
    return `u:${user}:pr:${key}`; // u:username:pr:source+id
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await withRetry(() =>
      this.client.get(this.prKey(userName, key))
    );
    return val ? (val as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await withRetry(() => this.client.set(this.prKey(userName, key), record));
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const pattern = `u:${userName}:pr:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};

    const result: Record<string, PlayRecord> = {};
    for (const fullKey of keys) {
      const value = await withRetry(() => this.client.get(fullKey));
      if (value) {
        // 截取 source+id 部分
        const keyPart = ensureString(fullKey.replace(`u:${userName}:pr:`, ''));
        result[keyPart] = value as PlayRecord;
      }
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.prKey(userName, key)));
  }

  // ---------- 收藏 ----------
  private favKey(user: string, key: string) {
    return `u:${user}:fav:${key}`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await withRetry(() =>
      this.client.get(this.favKey(userName, key))
    );
    return val ? (val as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.favKey(userName, key), favorite)
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const pattern = `u:${userName}:fav:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};

    const result: Record<string, Favorite> = {};
    for (const fullKey of keys) {
      const value = await withRetry(() => this.client.get(fullKey));
      if (value) {
        const keyPart = ensureString(fullKey.replace(`u:${userName}:fav:`, ''));
        result[keyPart] = value as Favorite;
      }
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.favKey(userName, key)));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), passwordHash)
    );
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;

    const verification = await verifyPassword(password, ensureString(stored));
    if (verification.valid && verification.needsRehash) {
      const passwordHash = await hashPassword(password);
      await withRetry(() =>
        this.client.set(this.userPwdKey(userName), passwordHash)
      );
    }
    return verification.valid;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), passwordHash)
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // 删除用户密码
    await withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 删除搜索历史
    await withRetry(() => this.client.del(this.shKey(userName)));

    // 删除播放记录
    const playRecordPattern = `u:${userName}:pr:*`;
    const playRecordKeys = await withRetry(() =>
      this.client.keys(playRecordPattern)
    );
    if (playRecordKeys.length > 0) {
      await withRetry(() => this.client.del(...playRecordKeys));
    }

    // 删除收藏夹
    const favoritePattern = `u:${userName}:fav:*`;
    const favoriteKeys = await withRetry(() =>
      this.client.keys(favoritePattern)
    );
    if (favoriteKeys.length > 0) {
      await withRetry(() => this.client.del(...favoriteKeys));
    }
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.client.lrange(this.shKey(userName), 0, -1)
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    // 插入到最前
    await withRetry(() => this.client.lpush(key, ensureString(keyword)));
    // 限制最大长度
    await withRetry(() => this.client.ltrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    } else {
      await withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<User[]> {
    const keys = await withRetry(() => this.client.keys('u:*:pwd'));
    const ownerUsername = process.env.USERNAME || 'admin';

    const usernames = keys
      .map((k) => {
        const match = k.match(/^u:(.+?):pwd$/);
        return match ? ensureString(match[1]) : undefined;
      })
      .filter((u): u is string => typeof u === 'string');

    // 获取用户创建时间并构造 User 对象
    const users = await Promise.all(
      usernames.map(async (username) => {
        // 尝试获取用户创建时间，如果没有则使用空字符串
        const createdAtKey = `u:${username}:created_at`;
        let created_at = '';
        try {
          const timestamp = await withRetry(() =>
            this.client.get(createdAtKey)
          );
          if (timestamp && typeof timestamp === 'number') {
            created_at = new Date(timestamp).toISOString();
          }
        } catch (err) {
          // 忽略错误，使用空字符串
        }

        return {
          username,
          role: username === ownerUsername ? 'owner' : 'user',
          created_at,
        };
      })
    );

    return users;
  }

  // ---------- 管理员配置 ----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (val as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await withRetry(() => this.client.set(this.adminConfigKey(), config));
  }

  // 跳过配置相关
  private skipConfigKey(userName: string, key: string): string {
    return `katelyatv:skip_config:${userName}:${key}`;
  }

  private skipConfigsKey(userName: string): string {
    return `katelyatv:skip_configs:${userName}`;
  }

  async getSkipConfig(
    userName: string,
    key: string
  ): Promise<EpisodeSkipConfig | null> {
    const data = await withRetry(() =>
      this.client.get(this.skipConfigKey(userName, key))
    );
    return data ? (data as EpisodeSkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    key: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    await withRetry(async () => {
      // 保存到独立的key
      await this.client.set(this.skipConfigKey(userName, key), config);
      // 同时加入到用户的跳过配置集合中
      await this.client.sadd(this.skipConfigsKey(userName), key);
    });
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const keys = await withRetry(() =>
      this.client.smembers(this.skipConfigsKey(userName))
    );

    const configs: { [key: string]: EpisodeSkipConfig } = {};

    for (const key of ensureStringArray(keys || [])) {
      const data = await withRetry(() =>
        this.client.get(this.skipConfigKey(userName, key))
      );
      if (data) {
        configs[key] = data as EpisodeSkipConfig;
      }
    }

    return configs;
  }

  async deleteSkipConfig(userName: string, key: string): Promise<void> {
    await withRetry(async () => {
      // 删除独立的key
      await this.client.del(this.skipConfigKey(userName, key));
      // 从用户的跳过配置集合中移除
      await this.client.srem(this.skipConfigsKey(userName), key);
    });
  }

  // ---------- 用户设置 ----------
  private userSettingsKey(userName: string) {
    return `u:${userName}:settings`;
  }

  async getUserSettings(userName: string): Promise<UserSettings | null> {
    const val = await withRetry(() =>
      this.client.get(this.userSettingsKey(userName))
    );
    return val ? (val as UserSettings) : null;
  }

  async setUserSettings(
    userName: string,
    settings: UserSettings
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.userSettingsKey(userName), settings)
    );
  }

  async updateUserSettings(
    userName: string,
    settings: Partial<UserSettings>
  ): Promise<void> {
    const current = await this.getUserSettings(userName);
    const defaultSettings: UserSettings = {
      filter_adult_content: true,
      theme: 'auto',
      language: 'zh-CN',
      auto_play: false,
      video_quality: 'auto',
    };
    const updated: UserSettings = {
      ...defaultSettings,
      ...current,
      ...settings,
      filter_adult_content:
        settings.filter_adult_content ?? current?.filter_adult_content ?? true,
    };
    await this.setUserSettings(userName, updated);
  }

  // ---------- 匿名来源健康评分 ----------
  private sourceHealthKey(sourceKey: string, date: string) {
    return `source:health:${date}:${sourceKey}`;
  }

  private sourceCircuitKey(sourceKey: string) {
    return `source:circuit:${sourceKey}`;
  }

  private sourceFailureKey(sourceKey: string) {
    return `source:search-fail:${sourceKey}`;
  }

  private sourceProbeKey(sourceKey: string) {
    return `source:circuit-probe:${sourceKey}`;
  }

  async recordSourceHealth(metric: SourceHealthMetric): Promise<void> {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const key = this.sourceHealthKey(metric.sourceKey, date);

    await withRetry(async () => {
      const pipeline = this.client.pipeline();
      pipeline.hset(key, { lastUpdated: Date.now() });
      pipeline.expire(key, 8 * 24 * 60 * 60);

      if (metric.phase === 'search') {
        pipeline.hincrby(key, metric.success ? 'searchOk' : 'searchFail', 1);
        pipeline.hincrby(key, 'searchCount', 1);
        pipeline.hincrbyfloat(
          key,
          'searchLatencyTotal',
          Math.max(0, metric.latencyMs || 0)
        );
      } else {
        pipeline.hincrby(
          key,
          metric.success ? 'playbackOk' : 'playbackFail',
          1
        );
        pipeline.hincrby(key, 'playbackCount', 1);
        if (metric.startupTimeMs && metric.startupTimeMs > 0) {
          pipeline.hincrby(key, 'startupCount', 1);
          pipeline.hincrbyfloat(key, 'startupTotal', metric.startupTimeMs);
        }
        if (metric.speedKBps && metric.speedKBps > 0) {
          pipeline.hincrby(key, 'speedCount', 1);
          pipeline.hincrbyfloat(key, 'speedTotal', metric.speedKBps);
        }
        if (metric.height && metric.height > 0) {
          pipeline.hincrby(key, 'heightCount', 1);
          pipeline.hincrbyfloat(key, 'heightTotal', metric.height);
        }
        if (metric.browserCompatible === false) {
          pipeline.hincrby(key, 'codecIncompatible', 1);
        }
      }
      await pipeline.exec();
    });

    if (metric.phase !== 'search') return;
    if (metric.success) {
      await withRetry(() =>
        this.client.del(
          this.sourceFailureKey(metric.sourceKey),
          this.sourceCircuitKey(metric.sourceKey),
          this.sourceProbeKey(metric.sourceKey)
        )
      );
      return;
    }

    const failures = await withRetry(() =>
      this.client.incr(this.sourceFailureKey(metric.sourceKey))
    );
    await withRetry(() =>
      this.client.expire(this.sourceFailureKey(metric.sourceKey), 30 * 60)
    );
    if (failures >= 3) {
      await withRetry(async () => {
        const pipeline = this.client.pipeline();
        pipeline.set(
          this.sourceCircuitKey(metric.sourceKey),
          Date.now() + 15 * 60 * 1000,
          { ex: 24 * 60 * 60 }
        );
        pipeline.del(this.sourceProbeKey(metric.sourceKey));
        await pipeline.exec();
      });
    }
  }

  async isSourceCircuitOpen(sourceKey: string): Promise<boolean> {
    const openUntil = Number(
      await withRetry(() => this.client.get(this.sourceCircuitKey(sourceKey)))
    );
    if (!Number.isFinite(openUntil) || openUntil <= 0) return false;
    if (Date.now() < openUntil) return true;

    const acquired = await withRetry(() =>
      this.client.set(this.sourceProbeKey(sourceKey), '1', {
        nx: true,
        ex: 60,
      })
    );
    return acquired !== 'OK';
  }

  async checkSourceHealthRateLimit(
    identityHash: string,
    limit: number,
    windowSeconds: number
  ): Promise<boolean> {
    const key = `source:health:rl:${identityHash}`;
    const count = await withRetry(() => this.client.incr(key));
    if (count === 1) {
      await withRetry(() => this.client.expire(key, windowSeconds));
    }
    return count <= limit;
  }

  async getSourceHealthScores(
    sourceKeys: string[]
  ): Promise<Record<string, SourceHealthScore>> {
    const uniqueKeys = Array.from(new Set(sourceKeys));
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - index);
      return date.toISOString().slice(0, 10).replaceAll('-', '');
    });
    const weights = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1];

    const rows = await withRetry(async () => {
      const pipeline = this.client.pipeline();
      uniqueKeys.forEach((sourceKey) =>
        days.forEach((date) =>
          pipeline.hgetall(this.sourceHealthKey(sourceKey, date))
        )
      );
      return pipeline.exec();
    });

    const numberValue = (row: unknown, field: string) => {
      const value = (row as Record<string, unknown> | null)?.[field];
      const number = Number(value || 0);
      return Number.isFinite(number) ? number : 0;
    };
    const scores: Record<string, SourceHealthScore> = {};
    let rowIndex = 0;

    uniqueKeys.forEach((sourceKey) => {
      let searchOk = 0;
      let searchCount = 0;
      let searchLatencyTotal = 0;
      let playbackOk = 0;
      let playbackCount = 0;
      let startupTotal = 0;
      let startupCount = 0;
      let speedTotal = 0;
      let speedCount = 0;
      let heightTotal = 0;
      let heightCount = 0;
      let updatedAt = 0;

      days.forEach((_date, dayIndex) => {
        const row = rows[rowIndex++];
        const weight = weights[dayIndex];
        searchOk += numberValue(row, 'searchOk') * weight;
        searchCount += numberValue(row, 'searchCount') * weight;
        searchLatencyTotal += numberValue(row, 'searchLatencyTotal') * weight;
        playbackOk += numberValue(row, 'playbackOk') * weight;
        playbackCount += numberValue(row, 'playbackCount') * weight;
        startupTotal += numberValue(row, 'startupTotal') * weight;
        startupCount += numberValue(row, 'startupCount') * weight;
        speedTotal += numberValue(row, 'speedTotal') * weight;
        speedCount += numberValue(row, 'speedCount') * weight;
        heightTotal += numberValue(row, 'heightTotal') * weight;
        heightCount += numberValue(row, 'heightCount') * weight;
        updatedAt = Math.max(updatedAt, numberValue(row, 'lastUpdated'));
      });

      scores[sourceKey] = calculateSourceHealthScore({
        searchOk,
        searchCount,
        searchLatencyTotal,
        playbackOk,
        playbackCount,
        startupTotal,
        startupCount,
        speedTotal,
        speedCount,
        heightTotal,
        heightCount,
        updatedAt,
      });
    });

    return scores;
  }
}

// 单例 Upstash Redis 客户端
function getUpstashRedisClient(): Redis {
  const legacyKey = Symbol.for('__MOONTV_UPSTASH_REDIS_CLIENT__');
  const globalKey = Symbol.for('__KATELYATV_UPSTASH_REDIS_CLIENT__');
  let client: Redis | undefined =
    (globalThis as any)[globalKey] || (globalThis as any)[legacyKey];

  if (!client) {
    const upstashUrl =
      process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_URL;
    const upstashToken =
      process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN;

    if (!upstashUrl || !upstashToken) {
      throw new Error(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env variables must be set'
      );
    }

    // 创建 Upstash Redis 客户端
    client = new Redis({
      url: upstashUrl,
      token: upstashToken,
      // 可选配置
      retry: {
        retries: 3,
        backoff: (retryCount: number) =>
          Math.min(1000 * Math.pow(2, retryCount), 30000),
      },
    });

    console.log('Upstash Redis client created successfully');

    (globalThis as any)[globalKey] = client;
    // 同步设置旧的全局键，保持向后兼容
    (globalThis as any)[legacyKey] = client;
  }

  return client;
}
