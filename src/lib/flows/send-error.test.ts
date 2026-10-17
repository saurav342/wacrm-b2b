import { expect, it } from 'vitest';
import { describeFlowSendError } from './send-error';

it('explains expired credentials rather than a generic authentication error', () => {
  const error = Object.assign(new Error('Authentication Error'), {
    code: 190,
    subcode: 463,
    httpStatus: 401,
  });
  expect(describeFlowSendError(error)).toMatchObject({
    detail: expect.stringContaining('access token has expired'),
    meta_code: 190,
    meta_subcode: 463,
    http_status: 401,
  });
});
it('explains invalid credentials without claiming expiration', () => {
  expect(
    describeFlowSendError(Object.assign(new Error('Bad token'), { code: 190 }))
  ).toMatchObject({
    detail: expect.stringContaining('access token is invalid'),
  });
});
it('preserves useful non-authentication errors', () => {
  expect(describeFlowSendError(new Error('Button title too long'))).toEqual({
    detail: 'Button title too long',
  });
  expect(describeFlowSendError(null)).toEqual({ detail: 'null' });
});
