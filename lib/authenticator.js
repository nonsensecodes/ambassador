import connectInit from './framework/initialize.js';
import connectAuth from './framework/authenticate.js';
import sessionAmbassador from './sessionambassador.js';
import sessionManager from './sessionmanager.js';

const authenticator = {}

Object.defineProperties(authenticator,

/* BEGIN AUTHENTICATOR AUGMENTATION *********************************************
Augment the OAuth object with action functions. These provide properties
and functions that are common to both OAuth 1.0 and 2.0 authentication
protocols, and assist in the exchange of an authorization code for an
access token. The goal of these functions is to negotiate the exchange,
capture the user's profile data, and pass it on to the appropriate callback
in order to successfully log the user into the site.
***************************************************************************/

{
  
  _populateAuthenticator:
  {
    value: function populateAuthenticator()
    {
      this._key = 'ambassador';
      this._emissaries = {};
      this._serializers = [];
      this._deserializers = [];
      this._infoTransformers = [];
      this._userProperty = 'user';
      this.sessionDev();
    },
    writable: false,
    configurable: true,
    enumerable: true
  },
  
  /* _loadEmissary ***
    
    Return emissary with given `name`. 
    
    @param {String} name
    @return {ambassadors}
    @api private
    
  */
  
  _loadEmissary:
  {
    value: function loadEmissary(name)
    { return this._emissaries[name]; },
    writable: false,
    configurable: true,
    enumerable: false
  },
  
  /* authenticate ***
  
    Middleware that returns the authenticate function which will iterate
    through the available emissaries and authenticate a request using
    the given `emissary` name, with optional `options` and `callback`.
    
    Examples:
    
      ambassador.authenticate('local',
      {
        successRedirect: '/',
        failureRedirect: '/login'
      })(req, res);
  
      ambassador.authenticate('local', function(err, user)
      {
        if (!user)
        { return res.redirect('/login'); }
        res.end('Authenticated!');
      })(req, res);
      
      ambassador.authenticate('basic', { session: false })(req, res);
      
      app.get('/auth/twitter', ambassador.authenticate('twitter'),
        function(req, res)
        {
          // request will be redirected to Twitter
        });
      app.get('/auth/twitter/callback',
        ambassador.authenticate('twitter'), function(req, res)
        { res.json(req.user); });
        
    @param {String} emissary
    @param {Object} options
    @param {Function} callback
    @return {Function} middleware
    @api public
    
  */
  
  authenticate:
  {
    value: function authenticate(name, options, callback)
    {
      let input =
      {
        name: name,
        options: options,
        callback: callback
      }
      return connectAuth(this, input);
    },
    writable: false,
    configurable: true,
    enumerable: true
  },
  
  /* authorize ***
    
    Middleware that will authorize a third-party account using the given
    `emissary` name, with optional `options`. If authorization is
    successful, the result provided by the emissary's verify callback will
    be assigned to `req.account`.  The existing login session and `req.user`
    will be unaffected. This function is particularly useful when connecting
    third-party accounts to the local account of a user that is currently
    authenticated.
    
    Examples:
    
      ambassador.authorize('twitter-authz',
        { failureRedirect: '/account' });
    
    @param {String} emissary
    @param {Object} options
    @return {Function} middleware
    @api public
  */
  
  authorize:
  {
    value: function authorize(emissary, options, callback)
    {
      options = options || {};
      options.assignProperty = 'account';
      let fn = this._framework.authorize || this._framework.authenticate;
      return fn(this, emissary, options, callback);
    },
    writable: false,
    configurable: true,
    enumerable: true
  },
  
  /* deserializeUser ***
    
    Registers a function used to deserialize user objects out of the
    session.
    
    Example:
    
      ambassador.deserializeUser(req, function(id, done)
      {
        User.findById(id, function (err, user)
        { done(err, user); });
      });
    
    @api public
  */
  
  deserializeUser:
  {
    value: function deserializeUser(req, options)
    {
      let { fn, done } = input;
      this._deserializers.push(fn);
      
      // private implementation that traverses the chain of deserializers,
      // attempting to deserialize a user
      let obj = fn;
      
      let stack = this._deserializers;
      (function pass(i, err, user)
      {
        // deserializers use 'pass' as an error to skip processing
        if ('pass' === err)
        { err = undefined; }
        
        // an error or deserialized user was obtained, done
        if (err || user)
        { return done(err, user); }
        
        // a valid user existed when establishing the session, but that
        // user has since been removed
        if (user === null || user === false)
        { return done(null, false); }
        
        let layer = stack[i];
        if (!layer)
        { return done(new Error('Failed to deserialize user out of session')); }
        
        
        function deserialized(e, u)
        { pass(i + 1, e, u); }
        
        /*
        let deserialArgs =
        {
          req: req,
          obj: obj,
          deserialized: deserialized
        }
        */
        
        try
        {
          layer(req, obj, deserialized);
        } catch(e) {
          return done(e);
        }
      })(0);
    },
    writable: true,
    configurable: true,
    enumerable: true
  },
  
  /* initialize ***
    
    ambassador's primary initialization middleware.
    
    This middleware must be in use by the Connect/Express application for
    ambassador to operate. Establishes an Ambassador object in which all
    other methods and data will be stored and passed.
    
    Options:
      - `userProperty`  Property to set on `req` upon login, defaults to
      _user_
    
    Examples:
    
      app.use(ambassador.initialize());
      
      app.use(ambassador.initialize({ userProperty: 'currentUser' }));
    
    @param {Object} options
    @return {Function} middleware
    @api public
    
  */
   
  initialize:
  {
    value: function initialize(options)
    {
      options = options || {};
      this._userProperty = options.userProperty || 'user';
      return connectInit(this, options);
    },
    writable: true,
    configurable: true,
    enumerable: true
  },
  
  /* serializeUser ***
  
    Registers a function used to serialize user objects into the session.
    
    Examples:
    
      ambassador.serializeUser(function(user, done)
      { done(null, user.id); });
    
    @api public
    
  */
  
  serializeUser:
  {
    value: function serializeUser(req, options)
    {
      let { fn, done } = input;
      
      this._serializers.push(fn);
      
      // private implementation that traverses the chain of serializers,
      // attempting to serialize a user
      let user = fn;
      
      let stack = this._serializers;
      (function pass(i, err, obj)
      {
        // serializers use 'pass' as an error to skip processing
        if ('pass' === err)
        { err = undefined; }
        // an error or serialized object was obtained, done
        if (err || obj || obj === 0)
        { return done(err, obj); }
        
        let layer = stack[i];
        if (!layer)
        { return done(new Error('Failed to serialize user into session')); }
        
        function serialized(e, o)
        { pass(i + 1, e, o); }
        
        /*
        let serialArgs =
        {
          req: req,
          user: user,
          serialized: serialized
        }
        */
        
        try
        {
          layer(req, user, serialized);
        } catch(e) {
          return console.error(e);
        }
      })(0);
    },
    writable: false,
    configurable: true,
    enumerable: true
  },
  
  /* session ***
    
    Middleware that will restore login state from a session.
    
    Web applications typically use sessions to maintain login state between
    requests.  For example, a user will authenticate by entering credentials
    into a form which is submitted to the server.  If the credentials are
    valid, a login session is established by setting a cookie containing a
    session identifier in the user's web browser.  The web browser will send
    this cookie in subsequent requests to the server, allowing a session to
    be maintained.
    
    If sessions are being utilized, and a login session has been
    established, this middleware will populate `req.user` with the current
    user.
    
    Note that sessions are not strictly required for ambassador to operate.
    However, as a general rule, most web applications will make use of
    sessions. An exception to this rule would be an API server, which
    expects each HTTP request to provide credentials in an Authorization
    header.
    
    Examples:
    
      app.use(cookieParser());
      app.use(session({ secret: 'keyboard cat' }));
      app.use(ambassador.initialize());
      app.use(ambassador.session());
    
    Options:
      - `pauseStream`      Pause the request stream before deserializing the
      user object from the session.  Defaults to _false_. Should  be set to
      true in cases where middleware consuming the request body is
      configured after ambassador and the deserializeUser method is
      asynchronous.
      
    @param {Object} options
    @return {Function} middleware
    @api public
    
  */
  
  session:
  {
    value: function session(options)
    { return this.authenticate('session', options); },
    writable: true,
    configurable: true,
    enumerable: true
  },
  
  sessionDev:
  {
    value: function sessionDev()
    {
      let sessionEmissary = Object.create(sessionAmbassador);
      sessionEmissary._populateSessionAmbassador({ key: this._key }, this.deserializeUser);
      this.use(sessionEmissary);
      this._sm = Object.create(sessionManager);
      this._sm._populateSessionManager({ key: this._key }, this.serializeUser);
    },
    writable: false,
    configurable: true,
    enumerable: true
  },
  
  /* transformAuthInfo ***
  
    Registers a function used to transform auth info.
    
    In some circumstances authorization details are contained in
    authentication credentials or loaded as part of verification.
    
    For example, when using bearer tokens for API authentication, the
    tokens may encode (either directly or indirectly in a database),
    details such as scope of access or the client to which the token was
    issued.
    
    Such authorization details should be enforced separately from
    authentication. Because ambassador deals only with the latter, this is
    the responsiblity of middleware or routes further along the chain.
    However, it is not optimal to decode the same data or execute the same
    database query later.  To avoid this, ambassador accepts optional `info`
    along with the authenticated `user` in an emissary's `success()` action. 
    This info is set at `req.authInfo`, where said later middlware or routes
    can access it.
    
    Optionally, applications can register transforms to proccess this info,
    which take effect prior to `req.authInfo` being set.  This is useful,
    for example, when the info contains a client ID.  The transform can load
    the client from the database and include the instance in the transformed
    info, allowing the full set of client properties to be convieniently
    accessed.
    
    If no transforms are registered, `info` supplied by the emissary will be
    left unmodified.
    
    Examples:
    
      ambassador.transformAuthInfo(function(info, done)
      {
        Client.findById(info.clientID, function (err, client)
        {
          info.client = client;
          done(err, info);
        });
      });
    
    @api public
    
  */
  
  transformAuthInfo:
  {
    value: function transformAuthInfo(req, options)
    {
      let { fn, done } = options;
      this._infoTransformers.push(fn);
      
      // private implementation that traverses the chain of transformers,
      // attempting to transform auth info
      let info = fn;
      
      let stack = this._infoTransformers;
      (function pass(i, err, tinfo)
      {
        // transformers use 'pass' as an error to skip processing
        if ('pass' === err)
        { err = undefined; }
        // an error or transformed info was obtained, done
        if (err || tinfo)
        { return done(err, tinfo); }
        
        let layer = stack[i];
        if (!layer)
        {
          // if no transformers are registered (or they all pass), the
          // default behavior is to use the un-transformed info as-is
          return done(null, info);
        }
        
        function transformed(e, t)
        { pass(i + 1, e, t); }
        
        try
        {
          var arity = layer.length;
          if (arity == 1) {
            // sync
            var t = layer(info);
            transformed(null, t);
          } else if (arity == 3) {
            layer(req, info, transformed);
          } else {
            layer(info, transformed);
          }
        } catch(e) {
          return done(e);
        }
      })(0);
    },
    writable: true,
    configurable: true,
    enumerable: true
  },
  
  /* use ***
  
    This sets up the given emissary as a nested object within the ambassador
    object under `_emissaries`, allowing the emissary to be processed in
    serial with other strategies that have been registered. First, call the
    appropriate `.populate*()` method with the relevant options and callback
    function for the given emissary, then call this function with the
    emissary passed as a parameter.
    
    Example:
    
      emissary.populateEmissary(options, verifyCallback);
      ambassador.use(emissary);
    
    @param {String|Emissary|Embassy} name
    @param {emissary} emissary
    @return {authenticator} for chaining
    @api public
    
  */
  
  use:
  {
    value: function use(emissary)
    {
      let name = emissary.name;
      this._emissaries[name] = emissary;
      return this;
    },
    writable: false,
    configurable: true,
    enumerable: true
  }
 
});
  
export default authenticator;
