module.exports = Backbone.View.extend({
  initialize: function() {
    this.render();
    this.listenTo(this.model, 'change:serverState', this.render);
  },

  template: Handlebars.compile($('#message-panel-template').html()),

  render: function() {
    var serverState = this.model.get('serverState');

    var args = {
      hidden: serverState == 'started' ? 'visible' : 'hidden'
    };

    this.$el.html(this.template(args));
    return this;
  }
});
