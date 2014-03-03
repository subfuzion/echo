var EchoClient = require('./../libs/echoclient')
  , EchoResponse = require('./EchoResponse')
  ;

/**
 * The App model provides a backbone wrapper over EchoClient and server functions
 */
var App = Backbone.Model.extend({
  defaults: {
    host: 'localhost',
    port: 5555,
    serverState: 'stopped'
  },

  initialize: function() {
    this.client = new EchoClient();

    var self = this;

    self.client.onopen = function() {
      console.log('client open');
      self.trigger('open');
    };

    self.client.onclose = function() {
      console.log('client close');
      // release handlers
      self.client.onopen = null;
      self.client.onclose = null;
      self.client.onerror = null;
      self.client.onmessage = null;
      self.client.onhistory = null;

      self.trigger('close');
    };

    self.client.onerror = function(err) {
      console.log('client error', err);
      self.trigger('error', err);
    };

    self.client.onmessage = function(response) {
      console.log(response);
      var er = new EchoResponse(response);
      console.log(er);
      self.trigger('message', new EchoResponse(response));
    };

    self.client.onhistory = function(response) {
      console.log('client history');
      self.trigger('history', new EchoResponse(response));
    };

    // sync up with server status
    this.checkServerStatus();
  },

  validate: function(attrs) {
    if (!this.client.validatePort(attrs.port)) {
      return 'invalid port';
    }
  },

  checkServerStatus: function() {
    var self = this;

    $.getJSON('/api/v1/echoserver/' + this.get('port'), function (result) {
      if (result && result.status == 'error') {
        console.log(result);
        self.trigger('serverError', result.message);
        return;
      }

      if (result && result.status == 'OK' && /started/.test(result.message)) {
        self.set('serverState', 'started');
      } else {
        self.set('serverState', 'stopped');
      }
    });
  },

  startServer: function() {
    if (!this.isValid()) return;
    this.sendServerCommand('start');
  },

  stopServer: function() {
    if (!this.isValid()) return;
    this.sendServerCommand('stop');
  },

  sendServerCommand: function(command) {
    if (!this.isValid()) return;

    this.set('serverError', '');

    var port = this.get('port');
    var self = this;

    $.post('/api/v1/echoserver/' + port + '/' + command, function (result) {
      if (result && result.status == 'error') {
        console.log(result);
        self.trigger('serverError', result.message);
        return;
      }

      console.log('success: ' + result.message);
      self.set('serverState', /started/.test(result.message, "i")
        ? 'started' : 'stopped');
    });
  },

  open: function() {
    var uri = 'ws://' + this.get('host') + ':' + this.get('port');
    console.log('client open: ' + uri);
    this.client.open(uri);
  },

  close: function() {
    console.log('client close');
    this.client.close();
  },

  send: function(message) {
    console.log('client send: ' + message);
    this.client.send(message);
  }
});

module.exports = App;

