// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/phone.ts';

test('normalizePhone: допустимые записи номера', () => {
  const valid = [
    '+7 701 234 56 78',
    '87012345678',
    '8 (701) 234-56-78',
    '+7(701)2345678',
    '+77012345678',
    '77012345678',
    ' 8-701-234-56-78 ',
  ];
  for (const raw of valid) assert.equal(normalizePhone(raw), '+77012345678', raw);
});

test('normalizePhone: все мобильные коды операторов', () => {
  for (const code of ['700', '701', '702', '705', '707', '708', '747', '771', '775', '776', '777', '778']) {
    assert.equal(normalizePhone(`8${code}1234567`), `+7${code}1234567`, code);
  }
});

test('normalizePhone: остальное отклоняется', () => {
  const invalid = [
    '',
    '12345',
    'телефон',
    '7012345678', // без кода страны
    '+7 701 234 56 7', // короткий
    '+7 701 234 56 789', // длинный
    '+7 727 234 56 78', // городской Алматы
    '+7 495 234 56 78', // Москва
    '+8 701 234 56 78',
    '+1 701 234 56 78',
    '++77012345678',
    '8701234567a',
  ];
  for (const raw of invalid) assert.equal(normalizePhone(raw), null, raw);
});
