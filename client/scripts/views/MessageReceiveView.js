var EchoResponse = require('../models/EchoResponse');

module.exports = Backbone.View.extend({
  initialize: function() {
    var self = this;

    this.model.on('message history', function(response) {
      self.render(response);
    })
  },

  template: require('./templates/message-receive.hbs'),

  render: function() {
    // only render when an EchoResponse is provided
    var response = arguments[0];
    if (!(response instanceof EchoResponse)) return;

    var args = {
      message: response.toDisplayString()
    };

    this.$el.html(this.template(args));

    return this;
  }
});