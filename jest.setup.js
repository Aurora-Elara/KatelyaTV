import '@testing-library/jest-dom/extend-expect';

const { TextDecoder, TextEncoder } = require('util');
const {
  ReadableStream,
  TransformStream,
  WritableStream,
} = require('stream/web');
const { MessageChannel, MessagePort } = require('worker_threads');

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;
global.ReadableStream = global.ReadableStream || ReadableStream;
global.TransformStream = global.TransformStream || TransformStream;
global.WritableStream = global.WritableStream || WritableStream;
global.MessageChannel = global.MessageChannel || MessageChannel;
global.MessagePort = global.MessagePort || MessagePort;

// Allow router mocks.
// eslint-disable-next-line no-undef
jest.mock('next/router', () => require('next-router-mock'));
