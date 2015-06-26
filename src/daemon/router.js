let net = require('net')
let express = require('express')
let util = require('util')
let conf = require('../conf')
let pkg = require('../../package.json')

module.exports = function (servers) {
  let router = express.Router()

  function index (req, res) {
    res.render('index', {
      pkg,
      monitors: servers.list()
    })
  }

  function kill (req, res) {
    res.end()
    util.log('Shutting down servers')
    servers.shutdown(() => {
      util.log('Exit')
      process.exit()
    })
  }

  function redirect (req, res, next) {
    let id = req.params.id

    if (!servers.has(id)) {
      return res.redirect('/')
    }

    // Start server
    servers.start(id)

    // Redirect when server is reachable
    let port = servers.get(id).env.PORT
    let hostname = req.hostname
    let timeout = conf.timeout
    let start = new Date()

    function forward () {
      // On connect, destroy client
      // and redirect
      function handleConnect () {
        clearInterval(intervalId)
        client.removeListener('error', handleError)
        client.destroy()
        let url = `http://${hostname}:${port}`
        util.log(`Redirect to ${url}`)
        res.redirect(url)
      }

      // On error, give up on timeout
      function handleError () {
        if (new Date() - start > timeout) {
          clearInterval(intervalId)

          let msg =
            `Can't connect to server on port ${port}, ` +
            `timeout of ${timeout}ms exceeded. Retry or check logs.`

          msg += '<pre><code>'
          msg += servers.get(id).command.join(' ')
          msg += '\n\n'
          msg += servers.get(id).tail
          msg += '</code></pre>'

          res.status(502).send(msg)
        }
      }

      // Try to connect
      let client = net
        .connect({ port }, handleConnect)
        .on('error', handleError)
    }

    let intervalId = setInterval(forward, 1000)
    forward()
  }

  router
    .get('/', index)
    .get('/:id', redirect)
    .post('/kill', kill)

  return router
}
