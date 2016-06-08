/* eslint-env mocha */

'use strict';

var sinon = require('sinon');
var assert = require('assert');
var utils = require('common/utils');
var Promise = require('es6-promise').Promise;

var services = require('../../lib/services/create');
var client = require('../../lib/api/client').create();
var Config = require('../../lib/config');
var Context = require('../../lib/cli/context');
var Daemon = require('../../lib/daemon/object').Daemon;
var sessionMiddleware = require('../../lib/middleware/session');

var ORG = {
  id: utils.id('org'),
  body: {
    name: 'my-org'
  }
};

var PROJECT = {
  id: utils.id('project'),
  body: {
    name: 'api-1',
    org_id: ORG.id
  }
};

var SERVICE = {
  id: utils.id('service'),
  body: {
    name: 'api-1',
    project_id: PROJECT.id,
    org_id: ORG.id
  }
};

var CTX_DAEMON_EMPTY;
var CTX;

describe('Services Create', function () {
  before(function () {
    this.sandbox = sinon.sandbox.create();
  });
  beforeEach(function () {
    this.sandbox.stub(services.output, 'success');
    this.sandbox.stub(services.output, 'failure');
    this.sandbox.stub(client, 'get')
      .onFirstCall()
      .returns(Promise.resolve({
        body: [ORG]
      }));
    this.sandbox.stub(client, 'post')
      .onFirstCall()
      .returns(Promise.resolve({
        body: [PROJECT]
      }))
      .onSecondCall()
      .returns(Promise.resolve({
        body: [SERVICE]
      }));
    this.sandbox.spy(client, 'auth');

    // Context stub when no token set
    CTX_DAEMON_EMPTY = new Context({});
    CTX_DAEMON_EMPTY.config = new Config(process.cwd());
    CTX_DAEMON_EMPTY.daemon = new Daemon(CTX_DAEMON_EMPTY.config);

    // Context stub with token set
    CTX = new Context({});
    CTX.config = new Config(process.cwd());
    CTX.daemon = new Daemon(CTX.config);
    CTX.params = ['abc123abc'];
    CTX.options = { org: { value: ORG.body.name } };

    // Empty daemon
    this.sandbox.stub(CTX_DAEMON_EMPTY.daemon, 'set')
      .returns(Promise.resolve());
    this.sandbox.stub(CTX_DAEMON_EMPTY.daemon, 'get')
      .returns(Promise.resolve({ token: '', passphrase: '' }));
    // Daemon with token
    this.sandbox.stub(CTX.daemon, 'set')
      .returns(Promise.resolve());
    this.sandbox.stub(CTX.daemon, 'get')
      .returns(Promise.resolve({
        token: 'this is a token',
        passphrase: 'a passphrase'
      }));
    // Run the token middleware to populate the context object
    return Promise.all([
      sessionMiddleware()(CTX),
      sessionMiddleware()(CTX_DAEMON_EMPTY)
    ]);
  });
  afterEach(function () {
    this.sandbox.restore();
  });
  describe('execute', function () {
    it('calls _execute with inputs', function () {
      this.sandbox.stub(services, '_prompt').returns(Promise.resolve());
      this.sandbox.stub(services, '_execute').returns(Promise.resolve());
      return services.execute(CTX).then(function () {
        sinon.assert.calledOnce(services._execute);
      });
    });
    it('skips the prompt when inputs are supplied', function () {
      this.sandbox.stub(services, '_prompt').returns(Promise.resolve());
      this.sandbox.stub(services, '_execute').returns(Promise.resolve());
      return services.execute(CTX).then(function () {
        sinon.assert.notCalled(services._prompt);
      });
    });
  });
  describe('_execute', function () {
    it('authorizes the client', function () {
      return services._execute(CTX.session, { name: 'api-1' }, ORG.body.name)
        .then(function () {
          sinon.assert.called(client.auth);
        });
    });

    it('errors if session is missing', function () {
      var session = CTX_DAEMON_EMPTY.session;
      var input = {};
      return services._execute(session, input, ORG.body.name).then(function () {
        assert.ok(false, 'should error');
      }).catch(function (err) {
        assert.ok(err);
        assert.strictEqual(err.message, 'Session object missing on Context');
      });
    });

    it('sends api request to services', function () {
      var input = { name: 'api-1' };
      return services._execute(CTX.session, input, ORG.body.name).then(function () {
        sinon.assert.calledTwice(client.post);

        var firstGet = client.get.firstCall;
        var firstPost = client.post.firstCall;
        var secondPost = client.post.secondCall;
        assert.deepEqual(firstGet.args[0], {
          url: '/orgs',
          qs: {
            name: 'my-org'
          }
        });
        assert.deepEqual(firstPost.args[0], {
          url: '/projects',
          json: {
            body: {
              name: 'api-1',
              org_id: ORG.id
            }
          }
        });
        assert.deepEqual(secondPost.args[0], {
          url: '/services',
          json: {
            body: {
              name: 'api-1',
              project_id: PROJECT.id,
              org_id: ORG.id
            }
          }
        });
      });
    });
  });
});
