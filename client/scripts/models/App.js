var EchoClient = require('./../libs/echoclient')
  , EchoResponse = require('./EchoResponse')
  ;

/**
 * The App model provides a backbone wrapper over EchoClient and server functions
 */
var App = Backbone.Model.extend({
  defaults: {
    host: 'localhost',
    serverState: 'stopped'
  },

  initialize: function() {
  },

  validate: function(attrs) {
    if (!EchoClient.validatePort(attrs.port)) {
      console.log('port not valid: ' + attrs.port);
      return 'invalid port';
    }
  },

  // this could be used if we wanted the ui to indicate port
  // status beforehand
  checkServerStatus: function(callback) {
    var self = this;

    $.getJSON('/api/v1/echoserver/' + this.get('port'), function (result) {
      if (result.status == 'error') {
        return callback(result.message);
      }

      if (result.status == 'OK' && /started/.test(result.message)) {
        callback(null, 'started');
      } else {
        callback(null, 'stopped');
      }
    });
  },

  startServer: function() {
    this.sendServerCommand('start');
  },

  stopServer: function() {
    this.sendServerCommand('stop');
  },

  sendServerCommand: function(command) {
    // clear last error
    this.set('serverError', null);

    if (!this.isValid()) {
      console.log('sendServerCommand state not valid for command: ' + command);
      return;
    }

    if (command == 'start' && this.serverState == 'started') {
      console.log('server already started');
      return;
    }

    if (command == 'stop' && this.serverState == 'stopped') {
      console.log('server already stopped');
      return;
    }

    var port = this.get('port');

    var self = this;

    $.post('/api/v1/echoserver/' + port + '/' + command, function (result) {
      if (result && result.status == 'error') {
        if (command == 'stop') {
          // for whatever reason we got an error result, we can still
          // safely assume that the server is in fact stopped, so just
          // make sure the ui gets updated and return
          self.set('serverState', 'stopped');
          return;
        }

        // otherwise trigger an error event
        self.trigger('serverError', result.message);
        return;
      }

      // HACK: a bit brittle; ideally we can add another field to the
      // protocol response so that we know exactly what the action was,
      // but for now we know that the response only mentions
      // 'started' when the server has been started; it mentions
      // 'stopped' when the server is stopped.
      var started = /started/.test(result.message, "i");

      // once the web socket server is started on the request port,
      // we want to connect to it; we could open the connection here,
      // but I chose to just have the view react to the state change
      // and then request this model to open the connection
      if (started) {
        console.log('server started on port ' + self.get('port'));
        self.set('serverState', 'started');
      } else {
        console.log('server stopped on port ' + self.get('port'));
        self.set('serverState', 'stopped');
      }
    });
  },

  open: function() {
    if (this.get('isOpen')) {
      console.log('error: client already open');
      return;
    }
    console.log('open connection to ' + this.get('port'));

    this.client = new EchoClient();

    var self = this;

    self.client.onopen = function() {
      console.log('connection is open');
      self.set('isOpen', true);
      self.trigger('open');
    };

    self.client.onclose = function() {
      console.log('connection is closed');
      // release handlers
      self.client.onopen = null;
      self.client.onclose = null;
      self.client.onerror = null;
      self.client.onmessage = null;
      self.client.onhistory = null;
      self.client = null;

      self.set('isOpen', false);
      self.trigger('close');
    };

    self.client.onerror = function(err) {
      console.log('client error:');
      console.log(err);

      // release handlers
      self.client.onopen = null;
      self.client.onclose = null;
      self.client.onerror = null;
      self.client.onmessage = null;
      self.client.onhistory = null;
      self.client = null;

      self.set('isOpen', false);
      self.trigger('error', err.message);
    };

    self.client.onmessage = function(response) {
      var er = new EchoResponse(response);
      self.trigger('message', er);
    };

    self.client.onhistory = function(response) {
      var er = new EchoResponse(response);
      self.trigger('history', er);
    };

    var uri = 'ws://' + this.get('host') + ':' + this.get('port');
    console.log('opening connection to ' + uri);
    this.client.open(uri);
  },

  close: function() {
    if (this.get('isOpen')) return;
    console.log('close connection to ' + this.get('port'));
    this.client.close();
  },

  send: function(message) {
    if (!this.get('isOpen')) return;
    this.client.send(message);
  },

  sendHistoryCommand: function() {
    // just a shortcut for entering '[HISTORY]'
    if (!this.get('isOpen')) return;
    this.client.sendHistoryCommand();
  },

  historyFilter: function(pattern) {
    if (!this.get('isOpen')) return [];
    return this.client.historyFilter(pattern);
  }
});

module.exports = App;

