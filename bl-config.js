/* BANSHEE SOUND TECH — bl-config.js  (Placeholder values until you fill the central config sheet.)
   window.BL_CFG = this venue's sheet IDs / script URLs / PINs.
   Sourced from the central Google "config" sheet at runtime; baked defaults are
   a fallback so apps never hard-break. Storage is namespaced to "sound-tech".
   The ONLY hard-coded value to set later is CONFIG_SHEET_ID. Master edit-rights
   on that sheet are enforced by Google sharing, not by the app. */
(function(){
  var VENUE="sound-tech";
  try{ var P="bl:"+VENUE+":",ls=window.localStorage,_g=ls.getItem.bind(ls),_s=ls.setItem.bind(ls),_r=ls.removeItem.bind(ls);
    ls.getItem=function(k){return _g(P+k);};ls.setItem=function(k,x){return _s(P+k,x);};ls.removeItem=function(k){return _r(P+k);}; }catch(e){}
  var CONFIG_SHEET_ID="1EI9EvoMWQnYukiNMaB_XlIlMED1zvRuD8dNhj9iGSmY",CACHE_KEY="bl_cfg_cache",FETCH_MS=7000;
  var DEFAULTS={venueKey:VENUE,venueName:"Banshee Sound Tech",
    weeklyJobs:"PUT_WEEKLY_JOBS_SHEET_ID_HERE",endOfNight:"PUT_END_OF_NIGHT_SHEET_ID_HERE",cocktails:"",
    notesScript:"PUT_NOTES_APPS_SCRIPT_EXEC_URL_HERE",cleaningScript:"PUT_CLEANING_APPS_SCRIPT_EXEC_URL_HERE",eonScript:"PUT_EON_APPS_SCRIPT_EXEC_URL_HERE",
    staffPin:"3514",managerPin:"7286",masterPin:"8350"};
  var cached={}; try{cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"{}");}catch(e){}
  window.BL_CFG=Object.assign({},DEFAULTS,cached);
  function pc(l){var o=[],c="",q=false;for(var i=0;i<l.length;i++){var ch=l[i];if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c);c="";}else c+=ch;}o.push(c);return o;}
  function cl(s){return (s||"").replace(/^"|"$/g,"").trim();}
  async function refresh(){
    if(!CONFIG_SHEET_ID||CONFIG_SHEET_ID.indexOf("PUT_")===0)return;
    var url="https://docs.google.com/spreadsheets/d/"+CONFIG_SHEET_ID+"/gviz/tq?tqx=out:csv&sheet=config";
    var ctrl=new AbortController(),t=setTimeout(function(){ctrl.abort();},FETCH_MS);
    try{var res=await fetch(url,{signal:ctrl.signal});clearTimeout(t);if(!res.ok)throw 0;
      var rows=(await res.text()).split("\n").filter(function(l){return l.trim();}).map(pc);
      if(rows.length<2)return; var head=rows[0].map(cl),out={};
      for(var r=1;r<rows.length;r++){var row=rows[r].map(cl),rec={};head.forEach(function(h,i){rec[h]=row[i]||"";});
        if(rec.venue_key===VENUE){out={venueKey:VENUE,venueName:rec.venue_name||DEFAULTS.venueName,
          weeklyJobs:rec.weekly_jobs_sheet_id,endOfNight:rec.end_of_night_sheet_id,cocktails:rec.cocktails_sheet_id,
          notesScript:rec.notes_script_url,cleaningScript:rec.cleaning_script_url,eonScript:rec.eon_script_url,
          staffPin:rec.staff_pin,managerPin:rec.manager_pin,masterPin:rec.master_pin};break;} }
      Object.keys(out).forEach(function(k){if(!out[k])delete out[k];});
      var m=Object.assign({},DEFAULTS,out);localStorage.setItem(CACHE_KEY,JSON.stringify(m));
      window.BL_CFG=Object.assign(window.BL_CFG,m);
    }catch(e){clearTimeout(t);}
  }
  refresh(); window.BLConfig={get:function(){return window.BL_CFG;},refresh:refresh};
})();
