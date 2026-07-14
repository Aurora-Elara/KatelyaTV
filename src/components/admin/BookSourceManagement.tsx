'use client';

import { Edit3, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { BookHtmlSelectors, BookSourceConfig } from '@/lib/books/types';

const emptySelectors: BookHtmlSelectors = {
  resultList: '',
  title: '',
  detailLink: '',
  author: '',
  cover: '',
  description: '',
  tocList: '',
  chapterTitle: '',
  chapterLink: '',
  content: '',
};

const emptySource: BookSourceConfig = {
  key: '',
  name: '',
  type: 'opds',
  status: 'pending',
  baseUrl: '',
  opdsUrl: '',
  searchUrlTemplate: '',
  language: 'zh',
  isMature: false,
  allowedUses: {
    indexMetadata: true,
    cacheMetadata: false,
    displayFullText: false,
    cacheFullText: false,
  },
};

export default function BookSourceManagement() {
  const [builtIn, setBuiltIn] = useState<BookSourceConfig[]>([]);
  const [custom, setCustom] = useState<BookSourceConfig[]>([]);
  const [editing, setEditing] = useState<BookSourceConfig | null>(null);
  const [selectors, setSelectors] = useState<BookHtmlSelectors>(emptySelectors);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/book-sources');
      if (!response.ok) throw new Error('书源配置加载失败');
      const data = await response.json();
      setBuiltIn(data.builtIn || []);
      setCustom(data.custom || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '书源配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const beginEdit = (source?: BookSourceConfig) => {
    const value = source
      ? structuredClone(source)
      : structuredClone(emptySource);
    setEditing(value);
    setSelectors({ ...emptySelectors, ...(value.selectors || {}) });
    setError('');
  };

  const update = <K extends keyof BookSourceConfig>(
    key: K,
    value: BookSourceConfig[K]
  ) =>
    setEditing((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const payload: BookSourceConfig = {
        ...editing,
        selectors:
          editing.type === 'html'
            ? (Object.fromEntries(
                Object.entries(selectors).filter(([, value]) => value.trim())
              ) as unknown as BookHtmlSelectors)
            : undefined,
      };
      const response = await fetch('/api/admin/book-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '保存失败');
      setEditing(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (key: string) => {
    if (!window.confirm('确认删除这个书源配置？')) return;
    const response = await fetch(
      `/api/admin/book-sources?key=${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    );
    if (response.ok) await load();
  };

  if (loading) {
    return (
      <div className='flex items-center py-6 text-sm text-gray-500'>
        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
        加载书源…
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between gap-3'>
        <div className='text-sm text-gray-600 dark:text-gray-300'>
          已启用 {builtIn.length} 个内置来源，{custom.length} 个自定义来源
        </div>
        <button
          onClick={() => beginEdit()}
          className='inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700'
        >
          <Plus className='h-4 w-4' />
          添加书源
        </button>
      </div>

      {error && (
        <div className='rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'>
          {error}
        </div>
      )}

      <div className='overflow-x-auto'>
        <table className='w-full min-w-[640px] text-left text-sm'>
          <thead className='border-b border-gray-200 text-xs text-gray-500 dark:border-gray-700'>
            <tr>
              <th className='px-3 py-2'>名称</th>
              <th className='px-3 py-2'>类型</th>
              <th className='px-3 py-2'>状态</th>
              <th className='px-3 py-2'>许可</th>
              <th className='px-3 py-2 text-right'>操作</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-200 dark:divide-gray-800'>
            {[...builtIn, ...custom].map((source) => {
              const isBuiltIn = builtIn.some((item) => item.key === source.key);
              return (
                <tr key={source.key}>
                  <td className='px-3 py-3'>
                    <div className='font-medium text-gray-900 dark:text-white'>
                      {source.name}
                    </div>
                    <div className='text-xs text-gray-400'>{source.key}</div>
                  </td>
                  <td className='px-3 py-3 uppercase text-gray-600 dark:text-gray-300'>
                    {source.type}
                  </td>
                  <td className='px-3 py-3'>
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        source.status === 'enabled'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : source.status === 'blocked'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {source.status}
                    </span>
                  </td>
                  <td className='px-3 py-3 text-gray-600 dark:text-gray-300'>
                    {source.rightsBasis || (isBuiltIn ? '内置来源' : '未审核')}
                  </td>
                  <td className='px-3 py-3 text-right'>
                    {!isBuiltIn && (
                      <div className='inline-flex gap-1'>
                        <button
                          title='编辑'
                          onClick={() => beginEdit(source)}
                          className='p-2 text-gray-500 hover:text-emerald-700'
                        >
                          <Edit3 className='h-4 w-4' />
                        </button>
                        <button
                          title='删除'
                          onClick={() => remove(source.key)}
                          className='p-2 text-gray-500 hover:text-red-600'
                        >
                          <Trash2 className='h-4 w-4' />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className='border-t border-gray-200 pt-5 dark:border-gray-700'>
          <div className='mb-4 flex items-center justify-between'>
            <h4 className='font-semibold text-gray-900 dark:text-white'>
              {custom.some((item) => item.key === editing.key)
                ? '编辑书源'
                : '添加书源'}
            </h4>
            <button title='关闭' onClick={() => setEditing(null)}>
              <X className='h-5 w-5' />
            </button>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <label className='text-sm'>
              Key
              <input
                value={editing.key}
                onChange={(event) => update('key', event.target.value)}
                disabled={custom.some((item) => item.key === editing.key)}
                className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
              />
            </label>
            <label className='text-sm'>
              名称
              <input
                value={editing.name}
                onChange={(event) => update('name', event.target.value)}
                className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
              />
            </label>
            <label className='text-sm'>
              类型
              <select
                value={editing.type}
                onChange={(event) =>
                  update('type', event.target.value as 'opds' | 'html')
                }
                className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
              >
                <option value='opds'>OPDS</option>
                <option value='html'>授权 HTML</option>
              </select>
            </label>
            <label className='text-sm'>
              状态
              <select
                value={editing.status}
                onChange={(event) =>
                  update(
                    'status',
                    event.target.value as BookSourceConfig['status']
                  )
                }
                className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
              >
                <option value='pending'>待审核</option>
                <option value='enabled'>启用</option>
                <option value='blocked'>停用</option>
              </select>
            </label>
            <label className='text-sm sm:col-span-2'>
              基础 URL
              <input
                value={editing.baseUrl}
                onChange={(event) => update('baseUrl', event.target.value)}
                placeholder='https://example.com/'
                className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
              />
            </label>
            {editing.type === 'opds' ? (
              <>
                <label className='text-sm sm:col-span-2'>
                  OPDS 目录 URL
                  <input
                    value={editing.opdsUrl || ''}
                    onChange={(event) => update('opdsUrl', event.target.value)}
                    className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                  />
                </label>
                <label className='text-sm sm:col-span-2'>
                  搜索 URL 模板
                  <input
                    value={editing.searchUrlTemplate || ''}
                    onChange={(event) =>
                      update('searchUrlTemplate', event.target.value)
                    }
                    placeholder='https://example.com/search?q={query}'
                    className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                  />
                </label>
              </>
            ) : (
              <>
                <label className='text-sm sm:col-span-2'>
                  搜索 URL 模板
                  <input
                    value={editing.searchUrlTemplate || ''}
                    onChange={(event) =>
                      update('searchUrlTemplate', event.target.value)
                    }
                    placeholder='https://example.com/search?q={query}'
                    className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                  />
                </label>
                <label className='text-sm'>
                  授权依据
                  <select
                    value={editing.rightsBasis || ''}
                    onChange={(event) =>
                      update(
                        'rightsBasis',
                        (event.target.value ||
                          undefined) as BookSourceConfig['rightsBasis']
                      )
                    }
                    className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                  >
                    <option value=''>未填写</option>
                    <option value='public-domain'>公版</option>
                    <option value='open-license'>开放许可</option>
                    <option value='written-authorization'>书面授权</option>
                  </select>
                </label>
                <label className='text-sm'>
                  权利人
                  <input
                    value={editing.rightsHolder || ''}
                    onChange={(event) =>
                      update('rightsHolder', event.target.value)
                    }
                    className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                  />
                </label>
                <label className='text-sm sm:col-span-2'>
                  许可证明 URL
                  <input
                    value={editing.licenseUrl || ''}
                    onChange={(event) =>
                      update('licenseUrl', event.target.value)
                    }
                    className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                  />
                </label>
                <label className='text-sm'>
                  审核日期
                  <input
                    type='date'
                    value={editing.reviewedAt?.slice(0, 10) || ''}
                    onChange={(event) =>
                      update('reviewedAt', event.target.value)
                    }
                    className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                  />
                </label>
                <label className='flex items-end gap-2 pb-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={editing.allowedUses?.displayFullText || false}
                    onChange={(event) =>
                  update('allowedUses', {
                    ...(editing.allowedUses || {
                      indexMetadata: true,
                      cacheMetadata: false,
                      displayFullText: false,
                      cacheFullText: false,
                    }),
                        displayFullText: event.target.checked,
                      })
                    }
                  />
                  允许站内展示全文
                </label>
                <div className='grid gap-3 sm:col-span-2 sm:grid-cols-2'>
                  {Object.keys(emptySelectors).map((key) => (
                    <label key={key} className='text-sm'>
                      {key}
                      <input
                        value={selectors[key as keyof BookHtmlSelectors] || ''}
                        onChange={(event) =>
                          setSelectors((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        className='mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900'
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className='mt-5 flex justify-end gap-2'>
            <button
              onClick={() => setEditing(null)}
              className='rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700'
            >
              取消
            </button>
            <button
              disabled={saving}
              onClick={save}
              className='inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60'
            >
              {saving ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Save className='h-4 w-4' />
              )}
              保存并校验
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
