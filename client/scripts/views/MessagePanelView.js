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

    // this.listenTo(this.model, 'change:serverState', this.render);

    var self = this;
    this.model.on('open close', function() {
      self.render();
    })
  },

  template: require('./templates/message-panel.hbs'),

  render: function () {

    // var serverState = 'started'; // this.model.get('isOpen');
    console.log(this.model);
    var serverState = this.model.get('isOpen');

    var args = {
      //hidden: serverState == 'started' ? 'visible' : 'collapse'
      hidden: serverState ? 'visible' : 'collapse'
    };

    this.$el.html(this.template(args));

    this.sendView.setElement(this.$('#message-send')).render();
    this.receiveView.setElement(this.$('#message-receive')).render();
    this.historyView.setElement(this.$('#message-history')).render();

    $('#message').focus();

    return this;
  }

});
