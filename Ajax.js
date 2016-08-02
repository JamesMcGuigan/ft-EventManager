if( typeof FT === 'undefined' ) { FT = {}; }

/**
 *  FT.ajax is a wrapper around $.ajax. It adds per-component queuing of requests, additional ajaxOption flags, plus common handing for all requests.
 *
 *  FT.ajax provides the queuing functionality, and passes on to FT._ajax for the processing active requests
 * 
 *  FT.ajax._componentNotificationHandler is called as the first item in the success handler, before options.callbackWidget.success and options.success
 *  Callbacks in options.callbackWidget get called before those defined directly within options
 *  If a JSON response is returned, it will be converted into a JS object and FT.notificationsManager.trigger(response) called
 *  If a HTML response is returned, and not an empty string, options.substituteComponent.substituteWith(html) is called
 *  If options.callbackWidget is defined, then its callbacks (beforeSend, success, error, complete) will be called after each step
 *
 *  NOTE: The semantics of beforeSend(ajaxOptions) have been changed. It is now called directly by FT.ajax rather than being passed to $.ajax()
 *  The idea is that you can place an ajax call on the queue and then dynamically update the data to be sent just before the call is actually sent.
 *  It is passed a copy of the ajaxOptions hash, with its values as pointers to objects, thus you can modify grandchild values such as
 *  options.data.* or options.internal.abort within the beforeSend function and have them persist back to $.ajax().
 *  However changes to first-level children will, such as ajaxOptions.url, will not persist.
 *
 *  Setting ajaxOptions.internal.abort within beforeSend() will stop the request reaching $.ajax(), but success() and complete() will still get manually called
 *
 *  Ajax synchronization (only one component based request should be in the air at any one time to prevent race conditions):
 *  - All ajax requests will be given an ajaxKey, based on options.data.componentUid
 *  - FT.ajax.flags contains a boolean hash of all ajaxKeys that are currently in the air, key is set on beforeSend
 *  - FT.ajax.queue contains an array of requests that have yet to be sent
 *  - FT.ajax.keyCompleted(ajaxKey) will be triggered at the end of every complete
 *  -- shifts FT.ajax.queue[ajaxKey] and triggers FT.ajax
 *  -- if queue is empty, then clear flag on FT.ajax.flags 
 *
 *  In the case of Component::save(), a "componentPresave"+uid event will be triggered; the Editor will do a force submit 
 *  placing an editText.do request on the FT.ajax.queue under the componentUid ajaxKey (the async=false flag does not need to be set);
 *  the Component::save() does not need to wait for the editText.do request to return, and can immediately after call FT.ajax to
 *  place its own save.do request on the queue, also under the componentUid ajaxKey, save in the knowledge that the editText.do request
 *  will return from the server before the save.do is actually sent.
 *
 *  In the case of search.do, its perfectly acceptable to have more than one search request in the air any one time as 
 *  FT.EWidget.SearchForm has its own high level logic to only display the results of the last submitted request, and waiting 
 *  for the first search to return before submitting the second would only slow down the user experience.
 *
 *  There still remains another subtle race condition. If you swap two stories (position 1 and 2) using edit.do, 
 *  then click on position 2 and start editing before edit.do has returned, then order of events is:
 *  edit.do (move pos 1->2), getEditForm.do (pos 2), editText.do (applied to old-pos 1 == new-pos 2 )
 *
 *
 *  There still remains another subtle race condition. If you swap two stories (position 1 and 2) using edit.do, 
 *  then click on position 2 and start editing before edit.do has returned, then order of events is:
 *  edit.do (move pos 1->2), getEditForm.do (pos 2), editText.do (applied to old-pos 1 == new-pos 2 )
 *  Partial Solution 1: either server needs to compare furnitureUids and positions, and throw an error if they do not match
 *
 *  @author James McGuigan
 *
 *  @interface - Ajax::SubstituteComponent
 *    substituteWith(html) - replace html of Component
 *
 *  @interface - Ajax::CallbackWidget
 *    beforeSend( ajaxOptions ) - triggered before $.ajax, may modify ajaxOptions.data.*, and/or set options.internal.abort=true to terminate  
 *    success( jsonOrHtml, status )
 *    error( xhr, status, error )
 *    complete( xhr, status )       
 *
 *
 *  @param {String}    options.type                 'GET' or 'POST', defaults to 'POST'
 *  @param {Hash}      options.internal             [New] Nested hash that allows for modification within beforeSend
 *  @param {String}    options.internal.ajaxKey     [New] Allows the caller to provide a custom ajaxKey for queuing purposes
 *  @param {Boolean}   options.internal.abort       [New] If true, don't send the request, set within beforeSend to abort a request that no longer needs to be sent
 *  @param {Object}    options.substituteComponent  [New] Component to call substituteWith on if a HTML response is called 
 *  @param {Object}    options.callbackWidget       [New] Component with callbacks (beforeSend, success, error, complete) to be bound to the response
 *  @param {Object}    options.context              [New] Context (ie this) to pass to callbacks(beforeSend, success, error, complete)
 *  @param {Function}  options.beforeSend           function( ajaxOptions ) - this is not passed to $.ajax, but called directly and passed ajaxOptions
 *  @param {Function}  options.success              function( jsonOrHtml, status )
 *  @param {Function}  options.error                function( xhr, status, error )
 *  @param {Function}  options.complete             function( xhr, status )       
 */
FT.ajax = function( options ) {
    options.internal = options.internal || {};
    if( typeof options.internal.ajaxKey === 'undefined' ) { options.internal.ajaxKey = FT.ajax.getAjaxKey( options ); }
    if( typeof options.internal.abort   === 'undefined' ) { options.internal.abort   = false; }

    // Check if there is already an outstanding request in the air for this specific component, if so queue the request
    // if ajaxKey is null, then ignore the queue for this request
    // If FT.ajax.async === true, then ignore the queue for all requests (for debugging purposes)
    var ajaxKey = options.internal.ajaxKey;
    if( ajaxKey && FT.ajax.async !== true ) { 
        if( FT.ajax.flags[ ajaxKey ] === true ) {
            if( !(FT.ajax.queue[ ajaxKey ] instanceof Array) ) {
                FT.ajax.queue[ ajaxKey ] = [];
            }
            FT.ajax.queue[ ajaxKey ].push( options );
            return; // Don't call FT._ajax() 
        } else {
            FT.ajax.flags[ ajaxKey ] = true;
        }
    }
    options.url = FT.connectionManager.getURL(options.url);
    FT._ajax( options );
};

FT._ajax = function( options ) {
    var ajaxKey = FT.ajax.getAjaxKey( options );

    // Fill in default options for the ones passed in
    options = $.extend({
        context:            this,
        dataType:           'text',
        type:               options.method || 'POST',
        timeout:            30000,
        callbackWidget:     {},
        substituteComponent:{},
        internal:           {}
    }, options );

    var beforeSend = options.beforeSend;
    var success    = options.success;
    var error      = options.error;
    var complete   = options.complete;
    var context    = options.context;

    if( error instanceof Function || options.callbackWidget.error instanceof Function ) {
        options.error = function( request, status, errorThrown ) {
            // Possible values for the second argument (besides null) are "timeout", "error", "notmodified" and "parsererror".
            try { 
                if( error instanceof Function ) {
                    error.call( context, request, status, errorThrown );
                }
                if( options.callbackWidget.error instanceof Function ) {
                    options.callbackWidget.error( request, status, errorThrown );
                }
            } catch(e) {
                if( FT.eventManager ) { FT.eventManager.trigger( "addJavascriptExceptionNotification", e ); }
                console.error( "FT.ajax.error() - exception: ", options, e );
            }
        };
    }

    
    options.success = function( jsonOrHtml, status ) {
        try { 
            jsonOrHtml = FT.ajax.toJsonOrHtml( jsonOrHtml, options ); // NOTE: request.responseText is a readonly property
            if( FT.ajax._componentNotificationHandler instanceof Function ) {
                FT.ajax._componentNotificationHandler( jsonOrHtml, status, options );
            }
            if( success instanceof Function ) {
                success.call( context, jsonOrHtml, status );
            }
            if( options.callbackWidget.success instanceof Function ) {
                options.callbackWidget.success( jsonOrHtml, status );
            }
        } catch(e) {
            if( FT.eventManager ) { FT.eventManager.trigger( "addJavascriptExceptionNotification", e ); }
            console.error( "FT.ajax.success() - exception: ", options, e );
        }
    };



    options.complete = function( request, status ) {
        try { 
            if( complete instanceof Function ) {
                complete.call( context, request, status );
            }
            if( options.callbackWidget.complete instanceof Function ) {
                options.callbackWidget.complete( request, status );
            }
        } catch(e) {
            if( FT.eventManager ) { FT.eventManager.trigger( "addJavascriptExceptionNotification", e ); }
            console.error( "FT.ajax.complete() - exception: ", options, e );
        }
        FT.ajax.keyCompleted( ajaxKey );
    };
   
    
    
    if( beforeSend instanceof Function || options.callbackWidget.beforeSend instanceof Function ) {
        // Notice that options.beforeSend is not passed to $.ajax, but called immediatly
        options.beforeSend = function( options ) {
            try { 
                if( beforeSend instanceof Function ) {
                    beforeSend.call( context, options );
                }
                if( options.callbackWidget.beforeSend instanceof Function ) {
                    options.callbackWidget.beforeSend( options );
                }
            } catch(e) {
                if( FT.eventManager ) { FT.eventManager.trigger( "addJavascriptExceptionNotification", e ); }
                console.error( "FT.ajax.beforeSend() - exception: ", options, e );
            }
        };
        options.beforeSend( options );
    }

    // options.abort can be set within beforeSend, but still trigger success() and complete() to ensure code is in a consistant state
    if( options.internal.abort ) {
        try { 
            if( options.complete instanceof Function ) { options.complete.call( options.context ); } 
        } catch(e) {
            if( FT.eventManager ) { FT.eventManager.trigger( "addJavascriptExceptionNotification", e ); }
            console.error( "FT.ajax.complete() - exception: ", options, e );
        }
        FT.ajax.keyCompleted( ajaxKey );
    } else {
        var ajaxOptions = FT.ajax.optionsFilter( options );
        $.ajax( ajaxOptions );
    }
};


/** @param {Hash<Boolean>} FT.ajax.flags contains a boolean hash of all ajaxKeys that are currently in the air, key is set on beforeSend */
FT.ajax.flags = {};  

/** @param {Hash<Array>} FT.ajax.queue contains an array of requests that have yet to be sent */
FT.ajax.queue = {};

/** @param {Boolean} If set by user, don't queue requests - intended for debugging purposes */
FT.ajax.async = false;

FT.ajax.getAjaxKey = function( ajaxOptions ) {
    if (ajaxOptions.internal && ajaxOptions.internal.ajaxKey){
        return ajaxOptions.internal.ajaxKey;
    }
    var ajaxKey = null;

    //// getEditForm.do should also wait its turn in the queue (with loading message), its slower but will prevent race conditions with moving via edit.do
    //if( ajaxOptions.type === "GET" ) { return null; }

    if( ajaxOptions.data && typeof ajaxOptions.data.componentUid === "string" ) {
        return ajaxOptions.data.componentUid;
    }
    return null;
};

/**
 *  FT.ajax.keyCompleted(ajaxKey) will be triggered at the end of every complete and triggers off any remaining items in the queue
 */
FT.ajax.keyCompleted = function( ajaxKey ) {
    if( FT.ajax.queue[ ajaxKey ] && FT.ajax.queue[ ajaxKey ].length > 0 ) {
        var ajaxOptions = FT.ajax.queue[ ajaxKey ].shift(); 
        FT._ajax( ajaxOptions );
    } else {
        FT.ajax.flags[ ajaxKey ] = false;

        //// Notify the rest of the application that this queue has completed
        //if( FT.eventManager ) {
        //    FT.eventManager.trigger( "ajaxKeyCompleted"+ajaxKey );
        //}
    }
};


/**
 * Returns an options hash that only contains keys specified in the jQuery docs, prevents infinite recusrsion if other objects are passed in
 */
FT.ajax.optionsFilter = function( options ) 
{
    //
    // Iterate through the filter array comparing each item item in the array with each key in the options hash.
    // copy each matched key to the new ajaxOptions hash
    //
    var filter = [ 'async', 'cache', 'complete', 'contentType', 'data', 'dataFilter', 'dataType', 'error', 'global', 'ifModified', 
                   'jsonp', 'password', 'processData', 'scriptCharset', 'success', 'timeout', 'type', 'url', 'username', 'xhr' ],
        key, 
        i = 0,
        n = filter.length + 1, 
        ajaxOptions = {};

    for ( ; i < n; key = filter[ i++ ] ) if ( key in options ) ajaxOptions[ key ] = options[ key ];
 

    return ajaxOptions;
};


/**
 *  Generic handler for all ajax notification handlers.
 *  If the response if a HTML string, call options.substituteComponent.substituteWith( request.responseText )
 *  If the response is a JSON string, call FT.notificationsManager.trigger( response.responseText ) 
 */
FT.ajax._componentNotificationHandler = function( jsonOrHtml, status, options ) {
    if( (typeof jsonOrHtml === 'object')
     || (typeof jsonOrHtml === 'string' && jsonOrHtml.match(/^\s*\{/)) ) 
    {
        FT.notificationsManager.trigger( jsonOrHtml );
    
    } else if( typeof jsonOrHtml === 'string' && !(jsonOrHtml.match(/^\s*$/)) ) {
        if( options.substituteComponent && options.substituteComponent.substituteWith instanceof Function ) {
            options.substituteComponent.substituteWith( jsonOrHtml );
        }
    }
};

/**
 *  Tests if a server response signifies a successful operation. 
 *  Assumes that a HTML response is a success, otherwise checks jsonOrHtml[uid].success === true
 *
 *  @param {String|Object} jsonOrHtml  the server response
 *  @param {String}        uid         uid of the furniture/component to check
 */
FT.ajax.isNotificationSuccessForUid = function( jsonOrHtml, uid ) {
    jsonOrHtml = FT.ajax.toJsonOrHtml( jsonOrHtml );
    if( ( typeof jsonOrHtml === "string" ) ||
        ( typeof jsonOrHtml === "object" && jsonOrHtml[uid] && jsonOrHtml[uid].success === true ) )
    {
        return true;
    } else {
        return false;
    }
};
    
/**
 *  Tests if a server response if json or html, and return a html string or json object
 *  @param  {Object|String} jsonOrHtml   string/object
 *  @return {Object|String}              if json, returns an object; if html, returns a string
 */
FT.ajax.toJsonOrHtml = function( jsonOrHtml, ajaxOptions ) {
    if( typeof jsonOrHtml === 'string' && jsonOrHtml.match(/^\s*\{/) ) {
        try {
            var json = eval("("+jsonOrHtml+")");
            return json;
        } catch( e ) {
            if( FT.eventManager ) { FT.eventManager.trigger( "addJavascriptExceptionNotification", e, { json: jsonOrHtml, ajaxOptions: ajaxOptions } ); }
            console.error( "FT.ajax.toJsonOrHtml() - invalid json ", e, " json: ", jsonOrHtml, " ajaxOptions: ", ajaxOptions );
            return {};
        }
    } else {
        return jsonOrHtml;
    }
};
 
