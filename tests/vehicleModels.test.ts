import assert from 'node:assert/strict';
import test from 'node:test';
import { getVehicleModels } from '../src/lib/vehicleModels.ts';
import { VEHICLE_MAKES } from '../src/lib/locations.ts';

test('every named make in the listing form has model suggestions', () => {
  for (const make of VEHICLE_MAKES.filter(make => make !== 'Other')) {
    assert.ok(getVehicleModels(make).length > 0, make);
  }
});

test('suggestions stay specific to the selected make', () => {
  assert.ok(getVehicleModels('Toyota').includes('Axio'));
  assert.ok(getVehicleModels('Toyota').includes('Fielder'));
  assert.ok(!getVehicleModels('Nissan').includes('Axio'));
  assert.ok(getVehicleModels('Nissan').includes('Note'));
  assert.ok(getVehicleModels('Daihatsu').includes('Move'));
});

test('lookup handles existing make casing, whitespace and the Mercedes alias', () => {
  assert.deepEqual(getVehicleModels(' toyota '), getVehicleModels('Toyota'));
  assert.deepEqual(getVehicleModels('Mercedes-Benz'), getVehicleModels('Mercedes'));
});

test('Other or unknown makes return no restrictive suggestion list', () => {
  for (const make of ['', 'Other', 'Unlisted manufacturer', '__proto__']) assert.deepEqual(getVehicleModels(make), []);
});

test('suggestion lists have no blank or duplicate models', () => {
  for (const make of VEHICLE_MAKES) {
    const models = getVehicleModels(make);
    assert.ok(models.every(model => model.trim().length > 0));
    assert.equal(new Set(models.map(model => model.toLowerCase())).size, models.length);
  }
});
