import { describe, expect, it } from 'vitest';

import { translateAuthError } from '../../src/modules/auth/auth-errors';

describe('translateAuthError', () => {
  it.each([
    ['USER_ALREADY_EXISTS', 422, 'Selle e-postiga konto on juba olemas'],
    ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 422, 'Selle e-postiga konto on juba olemas'],
    ['INVALID_EMAIL_OR_PASSWORD', 401, 'Vale e-post või parool'],
    ['PASSWORD_TOO_SHORT', 400, 'Parool on liiga lühike'],
    ['INVALID_TOKEN', 400, 'Link on aegunud või vigane, küsi uus'],
  ])('translates %s', (code, status, message) => {
    expect(translateAuthError(status, { code, message: 'english text' })).toEqual({ error: true, message });
  });

  it('falls back to a text per status for unknown codes', () => {
    expect(translateAuthError(429, { code: 'SOMETHING_NEW' }).message).toMatch(/Liiga palju/);
  });

  it.each([null, undefined, 'plain text', 42])('handles a non-object body (%s)', (body) => {
    expect(translateAuthError(400, body)).toEqual({ error: true, message: 'Vigane päring' });
  });

  it('never forwards Better Auth internals for server errors', () => {
    const result = translateAuthError(500, { code: 'INTERNAL', message: 'db password=secret' });
    expect(result.message).not.toContain('secret');
  });

  it.each([
    ['INVALID_EMAIL_OR_PASSWORD', 401, 'Wrong email or password', 'Неверный адрес эл. почты или пароль'],
    ['USER_ALREADY_EXISTS', 422, 'An account with this email already exists', 'Аккаунт с этим адресом эл. почты уже существует'],
    ['INVALID_NAME', 400, 'The name must be 2–60 characters', 'Имя должно содержать от 2 до 60 символов'],
    ['SOMETHING_NEW', 429, 'Too many attempts, please try again in a moment', 'Слишком много попыток, попробуйте чуть позже'],
  ])('translates %s into English and Russian', (code, status, en, ru) => {
    expect(translateAuthError(status, { code }, 'en')).toEqual({ error: true, message: en });
    expect(translateAuthError(status, { code }, 'ru')).toEqual({ error: true, message: ru });
  });
});
