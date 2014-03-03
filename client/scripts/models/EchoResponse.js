var EchoResponse = Backbone.Model.extend({
  defaults: {
    status: '',
    responseTime: new Date().getTime(),
    type: 'message',
    messages: [ '' ]
  },

  toDisplayString: function() {
    // if not a message response (such as a history response),
    // then only display the response time
    return this.get('type') != 'message'
      ? '[response] ' + this.get('responseTime') + 'ms'
      : '"' + this.get('messages')[0] + '", ' + this.get('responseTime') + 'ms';
  }
});

module.exports = EchoResponse;