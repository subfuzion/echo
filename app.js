var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , echo = require('echo.io')
  , echoservers = {}  // map: port => server
  ;

var app = express();

app.configure(function () {
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function () {
  app.use(express.errorHandler());
});

http.createServer(app).listen(app.get('port'), function () {
  console.log("Express server listening on port " + app.get('port'));
});

app.get('/', routes.index);

app.post('/api/v1/echoserver/:port/start', function (req, res) {
  var port = parseInt(req.params.port, 10);

  if (isPortInUse(port)) {
    return res.json({
      status: 'error',
      message: 'address in use ' + port
    });
  }

  var echoserver = new echo.Server();

  echoserver.on('error', function(err) {
    console.log('error: ' + err.message);

    res.json({
      status: 'error',
      message: err.message
    });
  });

  echoserver.on('listening', function(port_) {
    console.log('echo server v0.0.7 started on port ' + port);

    echoservers[port_] = echoserver;

    res.json({
      status: 'ok',
      message: 'echo server started on port ' + port_
    });
  });

  echoserver.on('connection', function(ws) {
    var host = ws.upgradeReq.headers.host;
    var port = host.split(':')[1];

    console.log('echo connection opened on port ' + port);
  });

  echoserver.start(port);
});

app.post('/api/v1/echoserver/:port/stop', function (req, res) {
  var port = parseInt(req.params.port, 10);

  if (!isPortInUse(port)) {
    return res.json({
      status: 'error',
      message: 'no echo server listening on port ' + port
    });
  }

  var response;

  try {
    echoservers[port].close();

    response = {
      status: 'OK',
      message: 'echo server stopped on port ' + port
    };

  } catch (err) {
    response = {
      status: 'error',
      message: err.message
    };
  }

  echoservers[port] = null;

  res.json(response);
});

app.get('/api/v1/echoserver/:port', function (req, res) {
  var port = parseInt(req.params.port, 10);
  var response;

  if (isPortInUse(port)) {
    response = {
      status: 'OK',
      message: 'started'
    };
  } else {
    response = {
      status: 'OK',
      message: 'stopped'
    };
  }

  return res.json(response);
});

// helpers

function isPortInUse(port) {
  return echoservers[port] instanceof echo.Server;
}
