var MessageSendView = require('./MessageSendView')
  , MessageReceiveView = require('./MessageReceiveView')
  , MessageHistoryView = require('./MessageHistoryView')
  ;

module.exports = Backbone.View.extend({
  initialize: function () {

    this.sendView = new MessageSendView({
      model: this.model
    });

    this.receiveView = new MessageReceiveView({
      model: this.model
    });

    this.historyView = new MessageHistoryView({
      model: this.model,
      el: '#message-history'
    });

    this.render();

    this.listenTo(this.model, 'change:serverState', this.render);
  },

  template: Handlebars.compile($('#message-panel-template').html()),

  render: function () {
    var serverState = this.model.get('serverState');

    var args = {
      hidden: serverState == 'started' ? 'visible' : 'collapse'
    };

    this.$el.html(this.template(args));

    this.sendView.setElement(this.$('#message-send')).render();
    this.receiveView.setElement(this.$('#message-receive')).render();
    this.historyView.setElement(this.$('#message-history')).render();

    return this;
  }

});
