var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , echo = require('echo.io')
  , echoserver = null
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

  if (echoserver && echoserver.port == port) {
    return res.json({
      status: 'error',
      message: 'address in use ' + port
    });
  }

  echoserver = new echo.Server();

  echoserver.start(port, function(err) {
    var response;

    if (err) {
      console.log('error: ' + err.message);
      response = {
        status: 'error',
        message: err.message
      };
    } else {
      console.log('echo server started on port ' + port);
      response = {
        status: 'ok',
        message: 'echo server started on port ' + port
      };
    }

    res.json(response);
  });
});

app.post('/api/v1/echoserver/:port/stop', function (req, res) {
  var port = parseInt(req.params.port, 10);

  if (!echoserver) {
    return res.json({
      status: 'error',
      message: 'no echo server listening on port ' + port
    });
  }

  if (echoserver.port != port) {
    return res.json({
      status: 'error',
      message: 'echo server is listening on another port: ' + port
    });
  }

  var response;

  try {
    echoserver.close();
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

  echoserver = null;
  res.json(response);
});

app.get('/api/v1/echoserver/:port', function (req, res) {
  var port = parseInt(req.params.port, 10);

  if (!echoserver) {
    return res.json({
      status: 'OK',
      message: 'stopped'
    });
  }

  if (echoserver.port != port) {
    return res.json({
      status: 'error',
      message: 'echo server is listening on a different port: ' + port
    });
  }

  return res.json({
    status: 'OK',
    message: 'started'
  });
});



