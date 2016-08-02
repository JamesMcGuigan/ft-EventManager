/**
 *  FT.EventManager manages event listeners and event triggers.
 *  This allows for decoupled event-based communication between widgets. 
 *
 *  @examples
 *    FT.eventManager.register( this, "setActiveComponent", function() {} );
 *    FT.eventManager.trigger( "createDialogeBox", "Hello World" );
 *    FT.eventManager.unregister( this );
 *    FT.eventManager.logging = true;
 *
 *
 *  @events
 *  Below is a list of events registered/triggered within the application (please update as new ones are added):
 *
 *  //----- Command Events - trigger these events to tell other widgets to do things -----//
 *
 *  "clearEditor"             - no arg - instructs the Editor to clear itself
 *  "clearMessage" + uid      - no arg - instructs the WidgetMessage with uid to clear itself
 *  "clearNotificationsPanel" - no arg - instructs the NotificationsPanel to clear itself
 *  "startStatusPoll"         - no arg - instructs the StatusPoller to start
 *  "stopStatusPoll"          - no arg - instructs the StatusPoller to stop
 *  "unhighlightPositions"    - no arg - removes CSS classes signifying content selection
 *  "createDialogeBox"        - no string|hash - creates new instance of FT.EDWidget.DialogueBox via DialogueManager
 *
 *  "editComponent" - arg: component - instructs EditorManager to create new Editor.Component for specified Component
 *  "editFurniture" - arg: furniture - instructs EditorManager to create new Editor.Furniture for specified Furniture
 *  "editPage"      - arg: FT.page   - instructs EditorManager to create new Editor.Page      for specified FT.page
 *
 *  "setActiveComponent" - arg: component - triggered by Editor, updates all Component active flags*
 *  "publishToSection"   - arg: component - triggers LightboxManager to load publishToSection overlay
 *  "suspendToolboxTabs" - no arg         - stops the toolbox from programmatically updating tabs, prevents floatie maximization on component refresh
 *  "restoreToolboxTabs" - no arg         - restores toolbox to programmatically updating tabs
 *
 *  "addMessageToPanel"                  - arg: string
 *  "addJavascriptErrorNotification"     - arg: { error:, url:, line: } - triggered by window.onerror
 *  "addJavascriptExceptionNotification" - arg: { fileName:, lineNumber:, name:, message: }, { json:, ajaxOptions: } - jsException and/or json parse error
 *
 *
 *  //----- Status Events - triggered when the state of the application has changed -----//
 *
 *  "componentPreSave"    + this.component.uid - arg: component - triggered before call of AJAX save.do,             via component.save()
 *  "componentPrePublish" + this.component.uid - arg: component - triggered before call of AJAX publish.do,          via component.publish()
 *  "componentPreCancel"  + this.component.uid - arg: component - triggered before call of AJAX cancel_component.do, via component.cancel()
 *  "componentSaved"      + this.component.uid - arg: component - triggered on complete of AJAX save.do
 *  "componentPublished"  + this.component.uid - arg: component - triggered on complete of AJAX publish.do
 *  "componentCanceled"   + this.component.uid - arg: component - triggered on complete of AJAX cancel_component.do
 *  "componentRefreshed"  + this.component.uid - arg: component - triggered after component.substituteWith
 *  "componentLocked"     + this.component.uid - arg: component - triggered after component lock status change
 *  "componentUnlocked"   + this.component.uid - arg: component - triggered after component lock status change
 *  "componentModified"   + this.component.uid - arg: component - triggered after component modified status change
 *  "componentUnmodified" + this.component.uid - arg: component - triggered after component modified status change
 *  "componentValid"      + this.component.uid - arg: component - on freestyle components, triggered by Editor when HTML validates
 *  "componentInvalid"    + this.component.uid - arg: component - on freestyle components, triggered by Editor when HTML fails to validate
 *
 *  "furnitureModified"   + this.furniture.uid - arg: furniture - not currently triggered
 *  "furnitureUnmodified" + this.furniture.uid - arg: furniture - not currently triggered
 *
 *
 *  //----- Getter Events - trigger in order to request data from the rest of the application -  -----//
 *
 *  "returnAll"              - @return {Array<FT.Widget>} list of all undestroyed widgets in memory - can be triggered via: FT.eventManager.getWidgetCountInMemory()
 *  "returnAll" + this.klass - @return {Array<FT.Widget>} list of all undestroyed widgets in memory with specified klass (doesn't include child classes)
 *  "getActiveComponent"     - @return {Array<FT.EWidget.Component>} 0-1 length array, listing the active component
 *
 *  @author James McGuigan
 */
FT.EventManager = FT.Manager.extend({
    klass: "FT.EventManager",
 
    events:      null,  // {Hash}
    logging:     false, // {Boolean}       if true, add logging to all functions
    logKlass:    null,  // {Hash<Boolean>} if this.logKlass[context.klass] === true, then add logging
    logEvent:    null,  // {Hash<Boolean>} if this.logEvent[eventName] === true, then add logging
    stack:       null,  // {Array}         for debugging, stack of current events being triggered
    lastEventId: 0,

    constructor: function( options ) {
        this.options  = options || {};
        this.events   = {};
        this.stack    = [];

        this.logging  = this.options.logging  || false;
        this.logKlass = this.options.logKlass || {};
        this.logEvent = this.options.logEvent || {};
    },

    /**
     *  Returns a count of the number of each type of widget in memory.
     *  This is primary if use in debugging and locating memory leaks.
     *  If a klass is provided, the returned data is filtered to only include that klass
     *
     *  @param  {String} klass  [optional] the klass name
     *  @return {Hash<Number>}  list of widgets in memory indexed by klass
     */
    getWidgetCountInMemory: function( klassName ) {
        klassName = klassName || ''; 
        var count   = {};
        var widgets = this.trigger( "returnAll"+klassName );
        for( var i=0, n=widgets.length; i<n; i++ ) {
            var klass = widgets[i].klass;
            if( !count[klass] ) { count[klass] = 0; }
            count[klass]++;
        }
        return count;
    },



    /**
     *  Registers an handler function, for a given object for a perticular eventName
     *  @param {Object}   context         the instance to listen to the event
     *  @param {String}   eventName       the name of the event to listen for
     *  @param {Function} handler         the function to call when the event is triggered, may take multiple args passed in via trigger
     *  @param {Boolean}  options.delayed call handler after all non-delayed functions
     */
    register: function( context, eventName, handler, options ) {
        console.assert( typeof eventName === "string", this.klass+"::register: eventName must be of type String ", arguments ); // instanceof String fails in FF2
        console.assert( handler instanceof Function,   this.klass+"::register: handler must be of type Function ", arguments );

        if( !this.events[eventName] ) { this.events[eventName] = {}; }

        var eventHash = {
            eventId:   ++this.lastEventId,
            context:   context,
            eventName: eventName,
            handler:   handler,
            delayed:   !!(options && options.delayed)
        };
        
        this.events[eventName][eventHash.eventId] = eventHash;

        if( this.logging || this.logEvent[eventName] || this.logKlass[context.klass] ) {
            console.debug( context.klass, '::register(',eventName,') on context:', context.klass,'(',context,'), handler: ', handler, ' = ', this.events[eventName] );
        }
    },
    /**
     *  Unregisters any event handlers bound to an eventName
     *  @param {Object}   context    the instance to listen to the event
     *  @param {String}   eventName  [optional] eventName that was being listened for, if empty unbind all eventNames
     *  @param {Function} handler    [optional] reference to handler function, if empty unbind all functions
     */
    unregister: function( context, eventName, handler ) {
        var name, key;
        var eventNameHash = {};
        if( !this.events[eventName] ) { this.events[eventName] = {}; }

        if( eventName ) {
            eventNameHash[eventName] = eventName; // loop over only eventName
        } else {
            eventNameHash = this.events;          // loop over all eventNames
        }

        for( name in eventNameHash ) {
            if( !this.events[name] ) {
                continue;
            }
            for( key in this.events[name] ) {
                if( this.events[name][key]
                 && (!context || context === this.events[name][key].context)
                 && (!handler || handler === this.events[name][key].handler) ) {
                    delete this.events[name][key];
                }
            }
        }

        if( this.logging || this.logEvent[eventName] || this.logKlass[context.klass] ) {
            console.debug( context.klass, '::unregister(',eventName,') on context:', context.klass,'(',context,'), handler: ', handler, ' = ', this.events[eventName] );
        }
    },

    /**
     *  Fires an event, calls all listeners
     *  @param  {String} eventName  eventName to fire
     *  @param  {Object} arg        [optional] arg to pass to the event handlers
     *  @param  {Object} argN       [optional] may pass in multiple arguments
     *  @return {Array}             return values of all handler functions called
     */
    trigger: function( eventName ) {
        console.assert( typeof eventName === "string", this.klass+"::trigger: eventName must be of type String", arguments ); // instanceof String fails in FF2

        var i, pdi, key, eventHash, argKlass, args = [], result, results = [], processingDelayed;
        
        this.stack.push(eventName); // For debugging purposes
        if( this.logging || this.logEvent[eventName] ) {
            var eventNameKlass = {}, klass; 
            for( key in this.events[eventName] ) { 
                klass = this.events[eventName][key].context.klass; 
                eventNameKlass[klass] = (eventNameKlass[klass]||0) + 1; // useful for debugging event memory leaks
            }
            console.debug( this.klass, '::START::trigger( ', arguments, ') count: ', eventNameKlass, " stack: ", this.stack, ", over: ", this.events[eventName] );
        }
            
        for( i=1, n=arguments.length; i<n; i++ ) { // skip first argument, its the eventName
            args.push( arguments[i] );
        }

        // TODO: profile if this.events[eventName] is better off as a hash or an array
        if( this.events[eventName] ) {
            for( pdi=0, processingDelayed=false; pdi<2; pdi++, processingDelayed=true ) { 
                for( key in this.events[eventName] ) {
                    eventHash = this.events[eventName][key];
                    if( !eventHash ) {
                        continue; // nothing to see here... move on
                    }
                    if( eventHash.delayed != processingDelayed ) {
                        continue; // skip the delayed events first, then the normal ones on the second loop
                    }
                    
                    if( eventHash.context._destroyed ) {
                        this.unregister( eventHash.context ); // Garbage collection
                        continue;
                    }


                    if( eventHash.handler instanceof Function ) {

                        // Fire at William
                        result = eventHash.handler.apply( eventHash.context, args );
                        if( typeof result !== "undefined" ) {
                            results.push( result );
                        }

                        // Logging
                        if( eventHash.context && this.logKlass[eventHash.context.klass] ) {
                            argKlass = args[0] && args[0].klass || '';
                            console.debug( eventHash.context.klass, "::triggered(", eventName, ") args: ", argKlass, "(", args, ") = ", result, " stack: ", this.stack );
                        }
                    }
                }
            }
        }
        if( this.logging || this.logEvent[eventName] ) {
            console.debug( this.klass, '::END::trigger( ', eventName, args, ') over: ', this.events[eventName] );
        }
        this.stack.pop(); // For debugging purposes
        return results;
    }
});
