var EchoResponse = require('./../models/EchoResponse');

module.exports = Backbone.View.extend({
  initialize: function(options) {
    var self = this;

    this.render();

    this.model.on('history', function(response) {
      self.render(response);
    });
  },

  events: {
    'input #searchfilter': 'filterMessages',
    'click #btngethistory': 'getHistory'
  },

  template: Handlebars.compile($('#message-history-template').html()),

  render: function() {
    var response = arguments[0] || [];

    // the check is because cached messages from the server aren't
    // wrapped in EchoResponse backbone objects, just pojos
    var messages = response instanceof EchoResponse
      ? response.toJSON().messages
      : response.messages;

    var args = {
      messages: messages
    };

    this.$el.html(this.template(args));

    this.filterPattern(this.pattern);

    return this;
  },

  getHistory: function() {
    // just a shortcut for entering '[HISTORY]'
    this.model.sendHistoryCommand();
  },

  filterPattern: function() {
    if (arguments.length == 0) {
      return $('#searchfilter').val();
    } else {
      $('#searchfilter').val(arguments[0]);
      $('#searchfilter').focus();
    }
  },

  filterMessages: function() {
    this.pattern = this.filterPattern();
    var filtered = this.model.historyFilter(this.pattern);
    this.render(filtered);
  }
});