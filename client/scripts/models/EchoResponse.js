var EchoResponse = Backbone.Model.extend({
  defaults: {
    status: 'unknown',
    responseTime: new Date().getTime(),
    responseType: 'message',
    messages: []
  },

  toDisplayString: function() {
    // if not a message response (such as a history response),
    // then only display the response time
    return this.responseType == 'message'
      ? this.messages[0] + ', ' + this.responseTime + 'ms'
      : this.responseTime + 'ms';
  }
});

module.exports = EchoResponse;