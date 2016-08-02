/**
 *  Initalizes mocked versions of the following parts of the FT framework:
 *  - $.ajax
 *  - FT.Page
 *  - FT.connectionManager
 *  - FT.eventManager
 *  - FT.notificationsManager
 *  - FT.shortcutManager
 *  - FT.statusPoller
 *
 *  @author James McGuigan
 */
function mockInit() {
    mockAjax();
    FT.eventManager         = mockEventManager( new FT.EventManager() );
    FT.notificationsManager = mockObject( new FT.NotificationsManager() );
    FT._draggableData       = undefined;

    if( FT.ShortcutManager ) {
        FT.shortcutManager = mockObject( new FT.ShortcutManager() );
    } else {
        FT.shortcutManager = mockObject({
            register:   function() {},
            unregister: function() {}, 
            trigger:    function() {} 
        });
    }

    if( FT.StatusPoller ) {
        FT.statusPoller = mockObject( new FT.StatusPoller({ disabled: true }) );
    } else {
        FT.statusPoller = mockObject({
            register:   function() {},
            unregister: function() {}, 
            trigger:    function() {} 
        });
    }

    if( !FT.connectionManager ) {
        FT.connectionManager = mockObject({
            getURL: function(url) { return url; } 
        });
    }
    
    // FT.Page has a dependancy on FT.shortcutManager
    if( FT.Page ) {
        FT.page = mockObject( new FT.Page() );
    } else {
        FT.page = mockObject({
            username: "myself",
            uid:      "page-uid",
            enable:   function() {},
            disable:  function() {}        
        });
    }

}

var _alert = alert;
function mockAlert() {
    if( !$.browser.msie ) {
        try {
            alert = function( message ) { console.log('----- window.alert() -----\n'+message); };
        } catch(e) {}
    }
}
function restoreAlert() {
    if( !$.browser.msie ) {
        try {
            alert = _alert;
        } catch(e) {}
    }
}

var _setTimeout = setTimeout;
function mockSetTimeout() {
    if( !$.browser.msie ) {
        try {
            setTimeout = function( func, ms ) { func(); };
        } catch(e) {}
    }
}
function restoreSetTimeout() {
    if( !$.browser.msie ) {
        try {
            setTimeout = _setTimeout;
        } catch(e) {}
    }
}


/**
 *  Create a mock object, with wrappers around all functions such that function.called is incremented
 *  
 *  @return {Function}  function             a wrapper function, that updates called and lastArgs, and then calls the parent function
 *  @return {Integer}   function.called      the number of times the function has been called
 *  @return {Array}     function.lastArgs    a copy of the last arguments passed into the function
 *  @return {Anything}  function.lastReturn  a copy of the last value to be returned from the function
 */
function mockObject( instance ) {
    for( var key in instance ) {
        if( instance[key] instanceof Function ) {
            instance[key] = mockFunction( instance, instance[key] );
        }
    }
    return instance;
};


/**
 *  Wraps a function in the mock framework, a form of AOP to inspect the number of times the function has been called, 
 *  plus the last arguments and last return value
 *
 *  @param  {Object}    [optional] context  Context to for the function to be called in, defaults to this 
 *  @param  {Function}  function            Function to be wrapped    
 *  @return {Function}  function            a function that behaves exactly like the original function, but sets various parameters
 *          {Function}  function.orig       reference to the original function 
 *          {Number}    function.called     number of times the function has been called
 *          {Array}     function.lastArgs   Array version of the last arguments the function returned
 *          {Object}    function.lastReturn Last value returned by the function
 */
function mockFunction( context, func ) {
    if( !func && context instanceof Function ) {
        func = context;
        context = null;
    }
    if( typeof func === "string" && context && context[func] ) {
        func = context[func];
    }
    if(!( func instanceof Function )) {
        return func;
    }

    var originalFunction;
    if( typeof func.orig == 'undefined' ) {
        originalFunction = func;
        func.orig = originalFunction;
    } else {
        originalFunction = func.orig;
    }
    func = function() {
        func.orig = originalFunction;
        func.called++;
        func.lastArgs   = $.makeArray(arguments);
        func.lastReturn = func.orig.apply( this, arguments );
        return func.lastReturn;
    };

    for( var prop in originalFunction ) {
        func[prop] = originalFunction[prop]; 
    } 
    func.orig = originalFunction;
    func.called     = 0;
    func.lastArgs   = [];
    func.lastReturn = undefined;

    return func;
}

/**
 *  Mocks a <form>'s submit handler, to convert the submit data into a hash,
 *  accessable via form[0].data on the DOM object
 *  @param 
 */
var mockForm = function( form ) {
    form = $(form);
    form.submitted = 0;
    form.data      = {};
    form.unbind("submit").bind("submit", function(event) {
        this.submitted++;
        this.data = {};
        for( var i=0, n=this.elements.length; i<n; i++ ) {
            if( this.elements[i].name ) {
                switch( this.elements[i].type ) {
                    case "checkbox":
                        this.data[ this.elements[i].name ] = !!this.elements[i].value;
                        break;
                    default: 
                        this.data[ this.elements[i].name ] = $(this.elements[i]).val(); // .val() needed for IE
                        break;
                }
            }
        }
        event.preventDefault();
        return this.data;
    });
    return form;
};

/**
 *  @param  {FT.EventManager} eventManager                              an instance of FT.eventManager
 *  @return {Function}  eventManager                                    a modified instance of FT.eventManager
 *  @return {Integer}   eventManager.trigger.called[eventName]          the number of times the eventName has been triggered
 *  @return {Array}     eventManager.trigger.lastArgs[eventName]        list of additional args last passed to trigger, excluding eventName
 *  @return {Anything}  eventManager.trigger.lastReturn[eventName]      the last value to be returned from the eventName, usually undefined
 *  @return {Integer}   eventManager.register.called[eventName]         the number of times the eventName has been registered
 *  @return {Array}     eventManager.register.lastArgs[eventName]       list of args last passed to register [context, eventName, handler]
 *  @return {Integer}   eventManager.register.lastContext[eventName]    the number of times the eventName has been registered
 *  @return {Integer}   eventManager.unregister.called[eventName]       the number of times the eventName has been unregistered
 *  @return {Array}     eventManager.unregister.lastArgs[eventName]     list of args last passed to unregister [context, eventName, handler]
 *  @return {Integer}   eventManager.unregister.lastContext[eventName]  the number of times the eventName has been unregistered
 */
function mockEventManager( eventManager ) {
 
    var eventManagerTrigger = eventManager.trigger;
    eventManager.trigger = function( eventName ) {
        if( !eventManager.trigger.called[eventName] ) { 
            eventManager.trigger.called[eventName]     = 0;
            eventManager.trigger.lastArgs[eventName]   = [];
            eventManager.trigger.lastReturn[eventName] = undefined;
        }
        eventManager.trigger.called[eventName]++;
        eventManager.trigger.lastArgs[eventName]   = $.makeArray(arguments).slice(1); // doesn't include eventName
        eventManager.trigger.lastReturn[eventName] = eventManagerTrigger.apply( eventManager, arguments );
        return eventManager.trigger.lastReturn[eventName];
    };
    eventManager.trigger.called     = {};
    eventManager.trigger.lastArgs   = {};
    eventManager.trigger.lastReturn = {};


    var eventManagerRegister = eventManager.register;
    eventManager.register = function( context, eventName, handler ) {
        if( !eventManager.register.called[eventName] ) { 
            eventManager.register.called[eventName]      = 0;
            eventManager.register.lastArgs[eventName]    = [];
            eventManager.register.lastContext[eventName] = undefined;
        }
        eventManager.register.called[eventName]++;
        eventManager.register.lastArgs[eventName]    = $.makeArray(arguments);
        eventManager.register.lastContext[eventName] = context;
        return eventManagerRegister.apply( eventManager, arguments );
    };
    eventManager.register.called      = {};
    eventManager.register.lastArgs    = {};
    eventManager.register.lastContext = {};


    var eventManagerUnregister = eventManager.unregister;
    eventManager.unregister = function( context, eventName, handler ) {
        if( !eventManager.unregister.called[eventName] ) { 
            eventManager.unregister.called[eventName]      = 0;
            eventManager.unregister.lastArgs[eventName]    = [];
            eventManager.unregister.lastContext[eventName] = undefined;
        }
        eventManager.unregister.called[eventName]++;
        eventManager.unregister.lastArgs[eventName]    = $.makeArray(arguments);
        eventManager.unregister.lastContext[eventName] = context;
        return eventManagerUnregister.apply( eventManager, arguments );
    };
    eventManager.unregister.called      = {};
    eventManager.unregister.lastArgs    = {};
    eventManager.unregister.lastContext = {};

    return eventManager;
}


/**
 *  Mocks $.ajax function, and defines the $.ajaxServer hash to allow tests to fake an ajax response
 *
 *  {Function} $.ajax                    Will query $.ajaxServer rather than the server when making ajax calls
 *  {Number}   $.ajax.called[url]        Number of times each url has been called
 *  {Hash}     $.ajax.lastOptions[url]   The last ajaxOptions for each url
 *  {Object}   $.ajax.lastResponse[url]  The last $.ajaxServer.response for each url, undefined if last response was error
 *  {Object}   $.ajax.lastError[url]     The last $.ajaxServer.error for each url, undefined if last response was success
 *
 *  {Number}          $.ajaxCalled        Number of times $.ajax has been called
 *  {String}          $.ajaxLastUrl       Last url requested via $.ajax 
 *  {Hash}            $.ajaxLastOptions   Last ajaxOptions passed to $.ajax 
 *  {Object}          $.ajaxLastResponse  Last response returned via $.ajaxServer
 *  {Object}          $.ajaxLastError     Last error returned via $.ajaxServer
 *
 *  {Hash}            $.ajaxServer           A mock version of the ajax server
 *  {String}          $.ajaxServer.status    "success", "timeout", "error", "notmodified" or "parsererror"
 *  {Object|Function} $.ajaxServer.response  function(ajaxOptions): fake server response value for "success" state, default ""
 *  {Object|Function} $.ajaxServer.error     function(ajaxOptions): fake server response value for "error" state,   default {}
 *  {Hash}            $.ajaxServer.xhr       fake xhr object, defaults to empty hash 
 *  {Boolean}         $.ajaxServer.logging   if true, print additional logging to console.log()
 *  {Boolean}         $.ajaxServer.suspend   if true, wait for $.ajaxRespond(url) or $.ajaxRespondAll() before processing each request
 *  {Array}           $.ajaxServer.queue     internal array for storing suspended ajax requests 
 *
 *  @example
 *    var handler = function(html) {};
 *    $.ajaxServer.suspend = true;
 *    $.ajaxServer.response = function(ajaxOptions) {
 *        switch( ajaxOptions.url ) {
 *            case "example.do": return "Hello World";
 *            case "invalid.do": return { action: "invalid", message: "I'm sorry, Dave. I'm afraid I can't do that." };
 *        }
 *    }
 *    $.ajax({ url: "example.do", success: handler });
 *    $.ajax({ url: "example.do", success: handler });
 *    $.ajax({ url: "invalid.do", success: handler });
 *    equals( $.ajax.called,  3 );
 *    equals( handler.called, 0 );
 *    $.ajaxRespond("example.do");
 *    equals( handler.called, 1 );
 *    $.ajaxRespondAll();
 *    equals( handler.called, 3 );
 */
function mockAjax() {
    if( FT && FT.ajax ) {
        FT.ajax.flags = {}; // reset ajax queue
        FT._ajax = mockFunction( FT, FT._ajax );
    }
    
    $.ajaxServer  = { 
        response: "",
        status:   "success", // "timeout", "error", "notmodified" or "parsererror"
        xhr:      {},
        error:    {},
        suspend:  false,
        logging:  false,
        queue:    []
    };
    
    $.ajaxCalled       = 0;
    $.ajaxLastOptions  = null;
    $.ajaxLastResponse = null;
    $.ajaxLastError    = null;

    // Store $._ajax for unmocking purposes
    if( !$._ajax ) {
        $._ajax = $.ajax;
    }

    /**
     *  This is a mocked version of $.ajax that allows unit tests to fake ajax responses.
     *  It will call options.beforeSend(), options.success() then options.complete()
     *  It will pass the string or return value of $.ajaxServer.response to options.success()
     *  If $.ajaxServer.status === "error", then options.error() will be called instead of "sucess"
     *  If $.ajaxServer.suspend === true, then the ajax call will be held until $.ajaxRespond() is called
     *  $.ajaxReturn() handles part of the response that happens after the server has responded
     */
    $.ajax = function(options) {
        if( $.ajaxServer.logging ) { console.log("$.ajax(", options, "), $.ajaxServer: ", $.ajaxServer); }

        if( !$.ajax.called[options.url] ) {
            $.ajax.called[options.url]       = 0;
            $.ajax.lastOptions[options.url]  = {};
            $.ajax.lastResponse[options.url] = {};
            $.ajax.lastError[options.url]    = {};
        }
        $.ajaxCalled++;
        $.ajax.called[options.url]++;
        $.ajax.lastOptions[options.url] = options;
        $.ajaxLastOptions = options;

        if( options.beforeSend instanceof Function ) { 
            options.beforeSend( $.ajaxServer.xhr ); 
        }

        if( $.ajaxServer.suspend ) {
            FT.ajax.async = true; // queuing messes suspended ajax calls up
            $.ajaxServer.queue.push( options );
        } else {
            $.ajaxReturn( options );
        }
    };

    /**
     *  This is the part of $.ajax that happens after the server has responded
     */
    $.ajaxReturn = function(options) {
        $.ajax.lastOptions[options.url] = options;
        $.ajaxLastUrl     = options.url;
        $.ajaxLastOptions = options;

        if( $.ajaxServer.status === "success" ) {
            $.ajax.lastResponse[options.url] = $.ajaxLastResponse = ($.ajaxServer.response instanceof Function) ? $.ajaxServer.response(options) : $.ajaxServer.response;
            $.ajax.lastError[options.url]    = $.ajaxLastError    = undefined;
            if( options.success instanceof Function ) { 
                options.success( $.ajaxLastResponse, $.ajaxServer.status ); 
            }
        } else {
            $.ajax.lastError[options.url]    = $.ajaxLastError    = ($.ajaxServer.error instanceof Function) ? $.ajaxServer.error(options) : $.ajaxServer.error;
            $.ajax.lastResponse[options.url] = $.ajaxLastResponse = undefined;
            if( options.error instanceof Function ) { 
                options.error( $.ajaxServer.xhr, $.ajaxServer.status, $.ajaxServer.error ); 
            }
        }
        if( options.complete instanceof Function ) { 
            options.complete( $.ajaxServer.xhr, $.ajaxServer.status ); 
        }
    };

    /**
     *  Respond "server-side" to an ajax call when $.ajaxServer.suspend has been set,
     *  only triggers one ajax response
     *  @param {String} url  if set, respond to the given ajax url, else pick the next one on the queue
     */
    $.ajaxRespond = function( url ) {
        if( typeof url === "string" ) {
            for( var i=0, n=$.ajaxServer.queue.length; i<n; i++ ) {
                var ajaxOptions = $.ajaxServer.queue[i];
                if( ajaxOptions.url === url ) {
                    if( $.ajaxServer.logging ) { console.log( "$.ajaxRespond("+url+"): ", $.ajaxServer.queue[0] ); }
                    $.ajaxServer.queue.remove(i);  // remove before firing, just in case we go recursive
                    $.ajaxReturn( ajaxOptions );
                    return;
                }
            }
            console.warn( "$.ajaxRespond( "+url+" ): unknown url: ", $.ajaxServer.queue );
        } else {
            if( $.ajaxServer.queue.length ) {
                if( $.ajaxServer.logging ) { console.log( "$.ajaxRespond(): ", $.ajaxServer.queue[0] ); }
                $.ajaxReturn( $.ajaxServer.queue.shift() ); // pluck the first one from the queue
            } else {
                console.warn( "$.ajaxRespond(): $.ajaxServer.queue.length === 0", $.ajaxServer.queue );
            }
        }
    };

    /**
     *  Respond "server-side" to an ajax call when $.ajaxServer.suspend has been set,
     *  Triggers all remaining ajax responses
     *  @param  {String} url  if set, respond to the given ajax url, else pick the next one on the queue
     */    
    $.ajaxRespondAll = function() {
        if( $.ajaxServer.queue.length ) {
            if( $.ajaxServer.logging ) { console.log( "$.ajaxRespondAll(): ", $.map($.ajaxServer.queue, function(item){return item;}) ); }
            while( $.ajaxServer.queue.length ) {
                $.ajaxReturn(  $.ajaxServer.queue.shift() );
            }
        } else {
            console.warn( "$.ajaxRespond(): $.ajaxServer.queue.length === 0", $.ajaxServer.queue );
        }
        
    };

    $.ajax.called       = {};
    $.ajax.lastOptions  = {};
    $.ajax.lastResponse = {};
    $.ajax.lastError    = {};
 
}

/**
 *  Undoes the mocking of $.ajax
 */
function restoreAjax() {
    if( $._ajax ) {
        $.ajax = $._ajax;
    }
}


/**
 *  The first time this function is called, it stores a copy of the innerHTML of each selector
 *  The second or subsequent time it is called, it empties the html and restores the stored innerHTML
 */
function restoreSelectors( selectors ) {
    selectors = $.makeArray( selectors );
    for( var i=0, n=selectors.length; i<n; i++ ) {
        var selector = selectors[i];
        var nodes    = $(selector);

        // First time round, archive the html, after that restore it
        if( typeof restoreSelectors.data[selector] === "undefined" ) {
            restoreSelectors.data[selector] = [];
            for( var i=0, n=nodes.length; i<n; i++ ) {
                restoreSelectors.data[selector][i] = nodes[i].innerHTML;
            }
        } else {
            for( var i=0, n=nodes.length; i<n; i++ ) {
                nodes[i].innerHTML = restoreSelectors.data[selector][i];
            }
        }
    }
}
restoreSelectors.data = {};

function queryStringToHash( data ) {
    var hash = {};
    var pairs = data.split(/&/);
    for( var i=0, n=pairs.length; i<n; i++ ) {
        var keyValue = pairs[i].split(/=/);
        hash[keyValue[0]] = keyValue[1];
    }
    return hash;
}


function assertHashOfArraysEquals( actual, expected, message ) {
    for( var key in expected ) {
        if( expected[key] instanceof Array ) {
            same( actual[key], expected[key], "actual["+key+"] != expected["+key+"]: " + message );

        } else if( typeof expected[key] !== "object" ) {
            same( actual[key], expected[key], "actual["+key+"] != expected["+key+"]: " + message );

        } else {
            equals( actual[key], expected[key], "actual["+key+"] != expected["+key+"]: " + message );
        }
    }
    for( var key in actual ) {
        if( expected[key] instanceof Array ) {
            same( actual[key], expected[key], "expected["+key+"] != actual["+key+"]: " + message );
        
        } else if( typeof expected[key] !== "object" ) {
            same( actual[key], expected[key], "expected["+key+"] != actual["+key+"]: " + message );
        
        } else {
            equals( actual[key], expected[key], "expected["+key+"] != actual["+key+"]: " + message );
        }
    }
}

