import assert from 'node:assert/strict';
import { formatAdsetAudience, formatAdsetAudienceFull } from '../src/lib/metaAdsetAudience.js';

const lovato = {
  age_min: 18,
  age_max: 65,
  age_range: [26, 65],
  targeting_automation: { advantage_audience: 1, individual_setting: { age: 1 } },
  geo_locations: {
    cities: [
      { name: 'Antonina', region: 'Paraná' },
      { name: 'Campo Largo' },
      { name: 'Campo Magro' },
      { name: 'Curitiba' },
      { name: 'Morretes' },
      { name: 'São José dos Pinhais' },
    ],
    regions: [{ name: 'Minas Gerais' }],
  },
};

const lovatoText = formatAdsetAudience(lovato);
assert.match(lovatoText, /^26–65 anos/);
assert.doesNotMatch(lovatoText, /^18–65/);
assert.match(lovatoText, /Minas Gerais/);
assert.match(lovatoText, /Antonina/);
assert.match(formatAdsetAudienceFull(lovato), /Morretes/);
assert.match(formatAdsetAudienceFull(lovato), /Advantage\+ entrega de 18 a 65/);

const sharedCities = [
  { name: 'Almirante Tamandaré' },
  { name: 'Castro' },
  { name: 'Colombo' },
  { name: 'Itaperuçu' },
  { name: 'Rio Branco do Sul' },
];
const carA = {
  age_min: 18,
  age_max: 65,
  age_range: [18, 65],
  geo_locations: { cities: sharedCities },
  flexible_spec: [{ interests: [{ name: 'Chevrolet' }, { name: 'Automóveis' }] }],
};
const carB = {
  age_min: 18,
  age_max: 65,
  age_range: [18, 65],
  geo_locations: { cities: sharedCities },
  flexible_spec: [{ interests: [{ name: 'Motocicletas' }, { name: 'Automóveis' }] }],
};
assert.notEqual(formatAdsetAudience(carA), formatAdsetAudience(carB));
assert.match(formatAdsetAudience(carA), /Chevrolet/);
assert.match(formatAdsetAudience(carB), /Motocicletas/);

const franca35 = {
  age_min: 20,
  age_max: 48,
  genders: [2],
  geo_locations: { cities: [{ name: 'Franca', radius: 35, distance_unit: 'kilometer' }] },
};
const franca30 = {
  age_min: 20,
  age_max: 65,
  age_range: [20, 47],
  genders: [2],
  geo_locations: { cities: [{ name: 'Franca', radius: 30, distance_unit: 'kilometer' }] },
};
assert.match(formatAdsetAudience(franca35), /20–48 anos/);
assert.match(formatAdsetAudience(franca35), /mulheres/);
assert.match(formatAdsetAudience(franca35), /Franca 35 km/);
assert.match(formatAdsetAudience(franca30), /20–47 anos/);
assert.match(formatAdsetAudience(franca30), /Franca 30 km/);
assert.doesNotMatch(formatAdsetAudience(franca30), /^20–65/);

const neighborhood = {
  age_min: 18,
  age_max: 65,
  age_range: [18, 48],
  genders: [2],
  geo_locations: {
    cities: [{ name: 'Curitiba' }],
    neighborhoods: [{ name: 'Água Verde' }],
  },
};
assert.match(formatAdsetAudience(neighborhood), /18–48 anos/);
assert.match(formatAdsetAudience(neighborhood), /Água Verde/);

const pin = {
  age_min: 18,
  age_max: 65,
  age_range: [18, 65],
  geo_locations: {
    custom_locations: [{ latitude: -25.1, longitude: -49.3, radius: 4, distance_unit: 'kilometer' }],
  },
};
assert.match(formatAdsetAudience(pin), /raio 4 km/);

const stateName = {
  age_min: 18,
  age_max: 65,
  genders: [1],
  geo_locations: { regions: [{ name: 'São Paulo (state)' }, { name: 'Paraná' }] },
};
assert.match(formatAdsetAudience(stateName), /homens/);
assert.match(formatAdsetAudience(stateName), /São Paulo,/);
assert.doesNotMatch(formatAdsetAudience(stateName), /\(state\)/);

const allGenders = { age_min: 18, age_max: 54, genders: [0] };
assert.equal(formatAdsetAudience(allGenders), '18–54 anos');
assert.doesNotMatch(formatAdsetAudience(allGenders), /0/);

assert.equal(formatAdsetAudienceFull(null), 'Aberto / não informado');
assert.equal(formatAdsetAudience(''), '');

console.log('metaAdsetAudience ok');
