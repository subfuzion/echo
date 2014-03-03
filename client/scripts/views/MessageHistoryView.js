module.exports = Backbone.View.extend({
  initialize: function() {
    this.render();
  },

  template: Handlebars.compile($('#message-history-template').html()),

  render: function() {
    var args = {
    };

    this.$el.html(this.template(args));

    return this;
  }
});