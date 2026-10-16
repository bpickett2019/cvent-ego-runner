// Minimal DOM semantics for the existing VM tests, not a rendered-browser substitute.
export function createFixtureDom() {
  const elements=new Map(); let created=0;
  const make=(id,tag='div',attached=false)=>{
    const classes=new Set(),attributes=new Map(),listeners=new Map();
    const element={id,tagName:tag.toUpperCase(),value:'',files:[],disabled:false,hidden:false,checked:false,
      children:[],parentNode:null,dataset:{},style:{},scrollTop:0,scrollLeft:0,_text:'',
      get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},
      set textContent(value){this._text=String(value??'');for(const c of this.children)c.parentNode=null;this.children=[];},
      get childNodes(){return this.children;},get firstChild(){return this.children[0]??null;},
      get href(){return attributes.get('href')??'';},set href(value){attributes.set('href',String(value));},
      get isConnected(){return attached||!!this.parentNode?.isConnected;},
      classList:{add(...names){names.forEach(n=>classes.add(n));},toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);},remove(...names){names.forEach(n=>classes.delete(n));},contains(name){return classes.has(name);}},
      focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;},
      append(...children){for(const c of children)this.insertBefore(c,null);},appendChild(child){this.insertBefore(child,null);return child;},
      replaceChildren(...children){this.textContent='';this.append(...children);},
      removeChild(child){const i=this.children.indexOf(child);if(i<0)throw Error('Not a child');this.children.splice(i,1);child.parentNode=null;return child;},
      insertBefore(child,ref){if(typeof child==='string'){const text=make('text-'+created++,'#text');text.textContent=child;child=text;}
        if(child===ref)return child;if(child.parentNode)child.parentNode.removeChild(child);
        const i=ref===null?this.children.length:this.children.indexOf(ref);if(i<0)throw Error('Missing reference child');
        this.children.splice(i,0,child);child.parentNode=this;return child;},
      setAttribute(name,value){attributes.set(name,String(value));},getAttribute(name){return attributes.get(name)??null;},hasAttribute(name){return attributes.has(name);},removeAttribute(name){attributes.delete(name);},
      contains(child){return child===this||this.children.some(c=>c.contains(child));},
      addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
      removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(x=>x!==fn));},
      dispatchEvent(event){event.target??=this;for(const fn of listeners.get(event.type)||[])fn(event);return true;},
      querySelector(selector){return selector==='iframe'?get('viewerIframe'):get(id+':'+selector);},querySelectorAll(){return [];},
    };
    return element;
  };
  const get=id=>{if(!elements.has(id))elements.set(id,make(id,'div',true));return elements.get(id);};
  const document=Object.assign(make('document','document',true),{hidden:false,getElementById:get,
    createElement:tag=>make('created-'+created++,tag),createTextNode:text=>Object.assign(make('text-'+created++,'#text'),{textContent:text}),
    querySelector:selector=>get('selector:'+selector),querySelectorAll:()=>[]});
  return {get,document};
}
