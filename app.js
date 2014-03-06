var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , echo = require('echo.io')
  , echoservers = {}// map: port => { server: rerver, uri: uri }
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
  var responseSent = false;

  if (isPortInUse(port)) {
    return res.json({
      status: 'error',
      message: 'address in use ' + port
    });
  }

  var echoserver = new echo.Server();

  echoserver.on('error', function(err) {
    console.log('error: ' + err.message);

    clearPort(port);

    // don't try to return error to client if it happens
    // after the listening event, which returns ok
    if (!responseSent) {
      res.json({
        status: 'error',
        message: err.message
      });
    }
  });

  echoserver.on('listening', function(port_) {
    console.log('echo server v0.0.7 started on port ' + port_);

    setPort(port_, echoserver);

    res.json({
      status: 'ok',
      message: 'echo server started on port ' + port_
    });

    responseSent = true;
  });

  echoserver.on('connection', function(ws, host) {
    console.log('echo connection opened on uri ' + host);
    setPortConnection(port, host);
  });

  echoserver.on('clientclose', function(ws, host) {
    console.log('clientclose: ' + host);
    clearPort(port);
  });

  echoserver.on('clienterror', function(err, host) {
    console.log('clienterror ' + host + ' => ' + err.message);
    clearPort(port);
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
    clearPort(port);

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
  var channel = echoservers[port];
  return channel && channel.uri;
}

function setPort(port, server) {
    echoservers[port] = { server: server, uri: null };
}

function setPortConnection(port, uri) {
  echoservers[port].uri = uri;
}

function clearPort(port) {
  try {
    var channel = echoservers[port];
    if (channel && channel.server) {
      console.log('stopping server on port ' + port);
      channel.server.close();
      channel.server = null;
    }
  } catch (err) {
    console.log(err);
  }

  delete echoservers[port];
}
