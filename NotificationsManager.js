/**
 *  NotificationsManager is an instance of FT.UidEventManager
 *
 *  Known services using (or should be using) NotificationsManager are 
 *    /save.do        - save a component
 *    /publish.do     - publish a component
 *    /publishPage.do - publish as page
 *    /cancel_edit.do ??? - not quite sure if this sends back json or HTML 
 * 
 *  @author James McGuigan
 *  $Id:$
 */
FT.NotificationsManager = FT.UidEventManager.extend({
    klass: "FT.NotificationsManager",
    
    constructor: function( options ) {
        this.base( options );
    }
});
