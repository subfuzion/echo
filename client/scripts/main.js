// models
var App = require('./models/App')
  ;

// views
var ServerControlView = require('./views/ServerControlView')
  , MessagePanelView = require('./views/MessagePanelView')
  ;


var app = new App();

// wire up views

var serverControlView = new ServerControlView({
  model: app,
  el: '#server-control'
});

var messagePanelView = new MessagePanelView({
  model: app,
  el: '#message-panel'
});

module.exports = {
  app: app
};

