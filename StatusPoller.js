/**
 *  FT.StatusPoller polls the server /statusCheck.do and disseminates data based on UID
 *
 *  @examples
 *    FT.statusPoller.register({
 *        context: this,
 *        uidType: 'storyUUID',
 *        uids:    uids,
 *        handler: this.handlerNotification
 *    });
 *    FT.statusPoller.unregister({ context: this })
 *
 *  @author James McGuigan
 */
FT.StatusPoller = FT.UidEventManager.extend({
    klass: "FT.StatusPoller",
    
    url:            "statusCheck.do",
    interval:       10000, // 10s - for development component locking purposes - live should be more often 10s?
    workflowModulo: 10,    // Check for workflow status every n'th poll
    count:          0,     // Iterator for number of calls to the server made
    xhr:            null,  // Currently active xhr requests

    constructor: function( options ) {
        this.base( options );
        this.interval = (options && options.interval) || this.interval;
        this.url      = (options && options.url     ) || this.url;
        this.count    = 0;

        if( !options || !options.disabled ) {
            this.init();
        }
    },

    init: function() {
        this.startStatusPoll();
        FT.eventManager.register( this, "startStatusPoll", this.startStatusPoll );
        FT.eventManager.register( this, "stopStatusPoll",  this.stopStatusPoll );
    },

    /**
     *  Does an inital server poll, then sets up a repeating poll loop
     *  The inital poll is set using a small timeout, to allow this function to be 
     *  repeatedly called at startup with only a single call to the server actually being made
     */
    startStatusPoll: function() {
        var myself = this;
        if( this._startStatusPollSemaphore ) 
        {
            clearTimeout( this._startStatusPollSemaphore ); 
        }
        
        if( this._refreshTimeoutId ) 
        {
            clearTimeout( this._refreshTimeoutId );          
        }
        this._startStatusPollSemaphore = setTimeout( function() {
            myself.statusPollLoop();
            myself.pollServer();
        }, 50);
    },

    /**
     *  Set a repeating timeout to dynamically update the lock and workflow status
     */
    statusPollLoop: function() {
        var myself = this;
        if( this._refreshTimeoutId ) 
        { 
            clearTimeout( this._refreshTimeoutId );          
        }
        this._refreshTimeoutId = setTimeout( function() {
            myself.statusPollLoop();
            myself.pollServer( (++myself.count % myself.workflowModulo) === 0 );
        }, this.interval );
    }, 
    /**
     *  Stops the repeating timeout to dynamically update the lock and workflow status
     */
    stopStatusPoll: function() {
        if( this._startStatusPollSemaphore ) { clearTimeout( this._startStatusPollSemaphore ); }
        if( this._refreshTimeoutId         ) { clearTimeout( this._refreshTimeoutId );         }
    },

    trigger: function( json ) {
        this.base( json );
        //FT.notificationsManager.trigger( json ); // StatusPoller should only update the floatie
    },              

    pollServer: function( pollForWorkflow ) {
        var myself = this;
        var statusRefreshType = pollForWorkflow ? ["lockStatusRefresh","workflowStatusRefresh"] : ["lockStatusRefresh"];
        var uidTypeFilter     = pollForWorkflow ? { "componentUUID": true, "storyUUID": true }  : { "componentUUID": true };

        // Skip sending the next poll request if the previous one has not returned
        if( this.xhr && this.xhr.readyState !== 0 && this.xhr.readyState !== 4 ) {
            this.count--; // ensure every 10th request is a pollForWorkflow, even if we skip some
            return;
        }

        // TODO: pass hasUids() and getUidHash() the statusRefreshType
        if( !this.hasUids(uidTypeFilter) ) {
            return;
        }

        var uidHash = this.getUidHash(uidTypeFilter);
        uidHash.statusRefreshType = statusRefreshType;

        this.xhr = $.ajax({
            type:     'POST',
            url:      FT.connectionManager.getURL(this.url),
            data:     uidHash,
            dataType: 'json',
            success:  function( json, status ) {
                myself.trigger( json );
            }
        });
    },
    destroy: function() {
        if( this.xhr && this.xhr.readyState !== 4 ) {
            try {
                this.xhr.abort();
            } catch(e) {}
        }
        this.xhr = null;
        this.base();
    }
});
