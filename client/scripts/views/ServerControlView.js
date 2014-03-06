module.exports = Backbone.View.extend({
  serverErrorMessage: null,

  initialize: function() {
    var self = this;

    this.render();

    this.listenTo(this.model, 'change:serverState', function() {
      var serverState = this.model.get('serverState');
      console.log('change in server state => ' + serverState);
      self.render();
      if (serverState == 'started') {
        console.log('open request');
        this.model.open();
      } else {
        console.log('close request');
        this.model.close();
      }
    });

    this.model.on('serverError', function(err) {
      self.error = err;
      self.render();
    });

    this.model.on('error', function(err) {
      self.error = err;
      self.render();
    })
  },

  events: {
    'click #btnserver': 'togglestart'
  },

  //template: Handlebars.compile($('#server-control-template').html()),
  template: require('./templates/server-control.hbs'),

  render: function() {
    console.log('rendering start server');

    var port = this.model.get('port');
    var serverState = this.model.get('serverState');
    var serverStateText = serverState == 'started'
      ? 'started (port ' + port + ')'
      : serverState;
    var error = this.error ? ' Error: ' + this.error : null;
    var serverErrorClass = error ? 'visible' : 'hidden';

    var args = {
      stateClass: serverState,
      serverState: serverStateText,
      serverPort: port,
      inputVisibility: serverState == 'started' ? 'collapse' : 'visible',
      serverCommand: serverState == 'started' ? 'Stop' : 'Start',
      serverErrorClass: serverErrorClass,
      serverError: error
    };

    this.$el.html(this.template(args));

    $('#portnumber').focus();

    return this;
  },

  port: function() {
    return $('#portnumber').val();
  },

  togglestart: function(event) {
    event.preventDefault();

    // clear previous error message
    this.error = null;
    $('#server-error').html('');

    var port = this.port();
    this.model.set('port', port, { validate: true });
    if (this.model.validationError) {
      $('#portnumber').val('');
      return;
    }

    var command = this.model.get('serverState') == 'started' ? 'stop' : 'start';
    this.model.sendServerCommand(command);
  }
});
