module.exports = {
  start: function () {
    // models
    var App = require('./models/App')
      ;

    // views
    var ServerControlView = require('./views/ServerControlView')
      , MessagePanelView = require('./views/MessagePanelView')
      ;


    var app = new App();

    // wire up views
    // just creating them works since they wire
    // up the page and render when initialized

    new ServerControlView({
      model: app,
      el: '#server-control'
    });

    new MessagePanelView({
      model: app,
      el: '#message-panel'
    });

    // all wired up to the page and ready for user input
  }
};


