/**
 *  FT.NotificationsComet manages a $.ajaxLongPoll connection to notification.comet 
 *  and routes responses via FT.NotificationsManager
 *
 *  @examples
 *    FT.notificationsComet = new FT.NotificationsComet();
 *    FT.notificationsComet.stop();
 *    FT.notificationsComet.start();
 *    $.ajaxLongPoll.logging = true;
 *
 *  @author James McGuigan
 */
FT.NotificationsComet = Base.extend({
    klass: "FT.NotificationsComet",

    constructor: function( options ) {
        this.base();
        this.request = null;
        this.start();
    },

    start: function() {
        var myself = this;
        if( this.request ) {
            this.request.start();
        } else {
            this.request = $.ajaxLongPoll({
                type:     'GET',
                url:      'notification.comet',
                dataType: 'json',
                timeout:  0, // No Timeout
                data: {
                    pageUid: FT.page && FT.page.uid || ''
                },
                success:  function( json, status ) {
                    if( json ) {
                        // NOTE: json[error] is being listened for in FT.Page and will create a dialogueBox
                        FT.notificationsManager.trigger(json);

                        if( json["error"] && json["error"].refresh === "yes" ) {
                            myself.stop();                                                        
                        }
                    }
                }
            });
        }
    },

    stop: function() {
        if( this.request ) {
            this.request.stop();
        }
    },

    destroy: function() {
        this.stop();
        this.base();
    }
});


/**
 *  A $.ajax wrapper for comet
 */
$.ajaxLongPoll = function( options ) {
    var callee = arguments.callee;
    callee.active      = false;
    callee.error_delay = Number( callee.error_delay ) || 0;
    callee.pollId      = $.ajaxLongPoll.lastPollId++;

    if( $.ajaxLongPoll.logging ) { console.debug('$.ajaxLongPoll( options ): ', options, $.param(options) ); }
    callee.start = function() {
        if( callee.active ) { return; } // don't start more than once
        callee.active = true;

        var wrapperOptions = {};
        for( var key in (options || {}) ) {
            wrapperOptions[key] = options[key];
        }

        if( !wrapperOptions.data ) {
            wrapperOptions.data = {};
        }

        $.ajaxLongPoll.lastNocache = Math.max( (new Date()).getTime(), ($.ajaxLongPoll.lastNocache+1)||0 );
        wrapperOptions.data.nocache = $.ajaxLongPoll.lastNocache;

        wrapperOptions.error = function( xhr, status, error ) {
            if( !callee.active || $.ajaxLongPoll._destroyed ) { return; }

            if( xhr.status === 200 ) {
                callee.error_delay = 0;
                callee( options );

                if( $.ajaxLongPoll.logging ) { console.debug('$.ajaxLongPoll.200() - xhr: ', xhr, ' status:, ', status, ' error: ', error); }
                if( options.success instanceof Function ) {
                    options.success( {}, status );
                }
            } else {
                // Always use a setTimeout to ensure that we check $.ajaxLongPoll._destroyed after init-comet.js:destroy()
                // If we have had one or more failed polls, then keep adding a 200ms delay
                setTimeout( function() {
                    if( !callee.active || $.ajaxLongPoll._destroyed ) { return; }
                    callee( options );
                }, callee.error_delay * 500 );
                callee.error_delay++;

                if( $.ajaxLongPoll.logging ) { console.debug('$.ajaxLongPoll.error() - ', options, $.param(options), ' callee.active: ', callee.active, ' callee.error_delay: ', callee.error_delay ); }
                if( options.error instanceof Function ) {
                    options.error( xhr, status, error );
                }
            }
        };
        wrapperOptions.success = function( json, status ) {
            callee.error_delay = 0;
            if( !callee.active || $.ajaxLongPoll._destroyed ) { return; }
            callee( options );

            if( $.ajaxLongPoll.logging ) { console.debug('$.ajaxLongPoll.success() - json: ', json,  $.param(json), ' status:, ', status ,' options: ', options, $.param(options), ' callee.active: ', callee.active ); }
            if( options.success instanceof Function ) {
                 options.success( json, status );
            }
        };
        wrapperOptions.complete = function( request, status ) {
            delete $.ajaxLongPoll.xhrs[ callee.pollId ];
            if( !callee.active || $.ajaxLongPoll._destroyed ) { return; }

            if( $.ajaxLongPoll.logging ) { console.debug('$.ajaxLongPoll.complete() - status:, ', status , ' options: ', $.param(options), ' callee.active: ', callee.active ); }
            if( options.complete instanceof Function ) {
                options.complete( request, status );
            }
        };
        
        wrapperOptions.url = FT.connectionManager.getURL(wrapperOptions.url);        
        $.ajaxLongPoll.xhrs[ callee.pollId ] = $.ajax( wrapperOptions );
    };
    callee.stop = function() {
        callee.active = false;
        if( $.ajaxLongPoll.xhrs[ callee.pollId ] ) {
            try {
                $.ajaxLongPoll.xhrs[ callee.pollId ].abort();
            } catch(e) {}
        }
    };
    callee.start();
    return callee;
};
$.ajaxLongPoll.logging = false;
$.ajaxLongPoll.lastPollId = 0;
$.ajaxLongPoll.lastNocache = 0;
$.ajaxLongPoll.xhrs = {};
$.ajaxLongPoll._destroyed = false;

/**
 *  There is an intresting bug affecting IE and FF2.
 *  On a page refresh, as part of the page destructor, all active ajax requests will be aborted,
 *  but their callbacks will still be triggered, including $.ajaxLongPoll.error,
 *  which creates a new ajax connection that is not shut down by the normal page destructor
 *  thus we have to do this manually, otherwise one of the http requests will remain open,
 *  this ties up 1 of the 2 available concurrent HTTP requests to the hostname,
 *  causing all other ajax requests to wait on the ajaxLongPoll to complete before completing
 */
$.ajaxLongPoll.destroy = function( options ) {
    $.ajaxLongPoll._destroyed = true;
    for( var pollId in $.ajaxLongPoll.xhrs ) {
        if( $.ajaxLongPoll.xhrs[pollId] ) {
            try {
                $.ajaxLongPoll.xhrs[pollId].abort();
            } catch(e) {}
        }
    }
    $.ajaxLongPoll.xhrs = {};
};
