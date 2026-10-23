const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSchoolOperationsRoutes } = require('../school-operations');

test('school operations registers protected student, attendance, fee, overview and insights routes', () => {
  const routes = [];
  const app = {
    get: (path, ...handlers) => routes.push({ method: 'GET', path, handlers }),
    post: (path, ...handlers) => routes.push({ method: 'POST', path, handlers }),
    patch: (path, ...handlers) => routes.push({ method: 'PATCH', path, handlers }),
  };
  const middleware = () => (_req, _res, next) => next();
  registerSchoolOperationsRoutes(app, {
    authRequired: middleware(), adminIpAllowed: middleware(), schoolStaffRequired: middleware(),
    roleRequired: (...roles) => Object.assign(middleware(), { roles }),
  });
  const paths = routes.map(r => r.method + ' ' + r.path);
  for (const expected of [
    'GET /api/school/students','POST /api/school/students','PATCH /api/school/students/:studentId',
    'GET /api/school/attendance','POST /api/school/attendance/mark','GET /api/school/fees','GET /api/school/fee-students',
    'POST /api/school/fees/invoices','POST /api/school/fees/payments',
    'GET /api/school/overview','GET /api/school/insights'
  ]) assert.ok(paths.includes(expected), 'Missing route: ' + expected);
  for (const route of routes) {
    assert.ok(route.handlers.length >= 4, route.method + ' ' + route.path + ' should have auth and role middleware');
  }
  const feeWrite=routes.find(r=>r.path==='/api/school/fees/payments');
  assert.deepEqual(feeWrite.handlers[3].roles,['Manager','Headmaster','Bursar']);
  const studentRead=routes.find(r=>r.path==='/api/school/students'&&r.method==='GET');
  assert.deepEqual(studentRead.handlers[3].roles,['Secretary','Manager','Headmaster']);
});
