/* 相安开发者介绍：每次页面启动展示一次，本次关闭后不重复打扰。 */
(function(){
'use strict';
const modal=document.getElementById('developerWelcome');
if(!modal)return;
let shownForLaunch=false,previousFocus=null;
function display(){
 if(!modal.hidden)return;
 previousFocus=document.activeElement;modal.hidden=false;document.body.classList.add('developer-modal-open');
 const home=document.getElementById('home');if(home){home.setAttribute('inert','');home.setAttribute('aria-hidden','true');}
 const close=document.getElementById('developerWelcomeClose');if(close)setTimeout(()=>{if(!modal.hidden)close.focus();},80);
}
function show(){if(shownForLaunch)return;shownForLaunch=true;if(window.DangoCore&&window.DangoCore.state.settings.welcome===false)return;display();}
function hide(){
 modal.hidden=true;document.body.classList.remove('developer-modal-open');
 const home=document.getElementById('home');if(home){home.removeAttribute('inert');home.removeAttribute('aria-hidden');}
 if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus();
}
function showAbout(){display();}
function newLaunch(){shownForLaunch=false;show();}
const close=document.getElementById('developerWelcomeClose');
const start=document.getElementById('developerWelcomeStart');
const backdrop=document.getElementById('developerWelcomeBackdrop');
if(close)close.onclick=hide;if(start)start.onclick=hide;if(backdrop)backdrop.onclick=hide;
modal.querySelector('.developer-card')?.addEventListener('click',event=>event.stopPropagation());
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)hide();});
const about=document.getElementById('developerAboutButton');if(about)about.onclick=showAbout;
window.DangoDeveloperWelcome={show,hide,showAbout,newLaunch,isOpen:()=>!modal.hidden};
setTimeout(show,180);
})();
