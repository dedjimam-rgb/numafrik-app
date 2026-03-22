const API_URL = "https://numafrik-backend-production.up.railway.app/api";

const api = {
  token: localStorage.getItem("numafrik_token") || null,
  headers() {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  },
  async post(path, body) {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
    });
    return res.json();
  },
  async get(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: this.headers() });
    return res.json();
  },
  async register(email, password, name) {
    const data = await this.post("/auth/register", { email, password, name });
    if (data.token) { this.token = data.token; localStorage.setItem("numafrik_token", data.token); }
    return data;
  },
  async login(email, password) {
    const data = await this.post("/auth/login", { email, password });
    if (data.token) { this.token = data.token; localStorage.setItem("numafrik_token", data.token); }
    return data;
  },
  logout() { this.token = null; localStorage.removeItem("numafrik_token"); },
  async getMe() { return this.get("/users/me"); },
  async getCountries(service) { return this.get(`/orders/countries/${service}`); },
  async buyNumber(service, country) { return this.post("/orders/buy", { service, country }); },
  async getOrderStatus(id) { return this.get(`/orders/${id}/status`); },
  async cancelOrder(id) { return this.post(`/orders/${id}/cancel`, {}); },
  async getHistory() { return this.get("/orders/history"); },
  async initiatePayment(amount_fcfa) { return this.post("/payments/initiate", { amount_fcfa }); },
};

const SERVICES = [
  { id: "google", name: "Google / Gmail", icon: "🟦", popular: true },
  { id: "whatsapp", name: "WhatsApp", icon: "🟢", popular: true },
  { id: "tiktok", name: "TikTok", icon: "⬛", popular: true },
  { id: "telegram", name: "Telegram", icon: "🔷", popular: true },
  { id: "facebook", name: "Facebook", icon: "🔵", popular: true },
  { id: "instagram", name: "Instagram", icon: "🌸", popular: false },
  { id: "twitter", name: "Twitter / X", icon: "🐦", popular: false },
  { id: "netflix", name: "Netflix", icon: "🔴", popular: false },
];

const AMOUNTS = [
  { fcfa: 500, credits: 5 },
  { fcfa: 1000, credits: 11 },
  { fcfa: 2000, credits: 24 },
  { fcfa: 5000, credits: 62 },
  { fcfa: 10000, credits: 130 },
  { fcfa: 20000, credits: 270 },
];

const PAYMENTS = [
  { name: "T-Money", country: "Togo", icon: "📱" },
  { name: "Flooz", country: "Togo", icon: "📱" },
  { name: "MTN MoMo", country: "CI / Bénin", icon: "📱" },
  { name: "Wave", country: "Afrique de l'Ouest", icon: "🌊" },
  { name: "Orange Money", country: "Afrique de l'Ouest", icon: "🍊" },
];
function App() {
  const [tab, setTab] = useState("home");
  const [modal, setModal] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authData, setAuthData] = useState({ email: "", password: "", name: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  const [smsCode, setSmsCode] = useState(null);
  const [timer, setTimer] = useState(1200);
  const [history, setHistory] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState(2);
  const [copied, setCopied] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (api.token) {
      api.getMe().then(data => {
        if (data.success) setUser(data.user);
        else api.logout();
        setLoading(false);
      }).catch(() => setLoading(false));
    } else { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!activeOrder || smsCode) return;
    if (timer <= 0) { handleCancelOrder(); return; }
    const t = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [activeOrder, timer, smsCode]);

  useEffect(() => {
    if (!activeOrder || smsCode) return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getOrderStatus(activeOrder.orderId);
        if (data.code) {
          setSmsCode(data.code);
          clearInterval(pollRef.current);
          api.getMe().then(d => { if (d.success) setUser(d.user); });
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [activeOrder, smsCode]);

  const formatTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const handleAuth = async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      const data = authMode === "login"
        ? await api.login(authData.email, authData.password)
        : await api.register(authData.email, authData.password, authData.name);
      if (data.success) setUser(data.user);
      else setAuthError(data.error || "Erreur");
    } catch (e) { setAuthError("Erreur réseau"); }
    setAuthLoading(false);
  };

  const loadCountries = async (service) => {
    setCountriesLoading(true); setCountries([]);
    try {
      const data = await api.getCountries(service);
      if (data.success) setCountries(data.countries);
    } catch (e) {}
    setCountriesLoading(false);
  };

  const handleBuy = async () => {
    if (!selectedService || !selectedCountry) return;
    setOrderLoading(true);
    try {
      const data = await api.buyNumber(selectedService.id, selectedCountry.code);
      if (data.success) {
        setActiveOrder(data); setSmsCode(null); setTimer(1200); setModal("active");
        api.getMe().then(d => { if (d.success) setUser(d.user); });
      } else { alert(data.error); }
    } catch (e) { alert("Erreur réseau"); }
    setOrderLoading(false);
  };

  const handleCancelOrder = async () => {
    clearInterval(pollRef.current);
    if (activeOrder) {
      try {
        await api.cancelOrder(activeOrder.orderId);
        api.getMe().then(d => { if (d.success) setUser(d.user); });
      } catch (e) {}
    }
    setActiveOrder(null); setSmsCode(null); setModal(null);
  };

  const loadHistory = async () => {
    try {
      const data = await api.getHistory();
      if (data.success) setHistory(data.orders);
    } catch (e) {}
  };

  const handlePayment = async () => {
    try {
      const data = await api.initiatePayment(AMOUNTS[selectedAmount].fcfa);
      if (data.paymentUrl) window.open(data.paymentUrl, "_blank");
      else alert(data.error || "Erreur paiement");
    } catch (e) { alert("Erreur réseau"); }
  };

  if (loading) return React.createElement("div", {style:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0A0E1A",color:"#00E5A0",fontFamily:"sans-serif",fontSize:24}}, "Chargement...");
  if (!user) return React.createElement("div", {style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0A0E1A",padding:24}},
    React.createElement("div", {style:{background:"#111827",border:"1px solid rgba(255,255,255,0.07)",borderRadius:24,padding:"32px 24px",width:"100%",maxWidth:400}},
      React.createElement("h1", {style:{fontFamily:"sans-serif",fontSize:26,fontWeight:800,color:"#F0F4FF",marginBottom:4}}, "Num", React.createElement("span",{style:{color:"#00E5A0"}},"Afrik")),
      React.createElement("p", {style:{fontSize:14,color:"#7B8DB0",marginBottom:28}}, authMode==="login"?"Connecte-toi":"Crée ton compte"),
      authError && React.createElement("div",{style:{background:"rgba(255,71,87,0.1)",border:"1px solid rgba(255,71,87,0.2)",borderRadius:10,padding:12,fontSize:13,color:"#FF4757",marginBottom:14}}, authError),
      authMode==="register" && React.createElement("input",{style:{width:"100%",background:"#1C2537",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"13px 16px",color:"#F0F4FF",fontFamily:"sans-serif",fontSize:14,outline:"none",marginBottom:14},placeholder:"Nom complet",value:authData.name,onChange:e=>setAuthData(d=>({...d,name:e.target.value}))}),
      React.createElement("input",{style:{width:"100%",background:"#1C2537",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"13px 16px",color:"#F0F4FF",fontFamily:"sans-serif",fontSize:14,outline:"none",marginBottom:14},placeholder:"Email",type:"email",value:authData.email,onChange:e=>setAuthData(d=>({...d,email:e.target.value}))}),
      React.createElement("input",{style:{width:"100%",background:"#1C2537",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"13px 16px",color:"#F0F4FF",fontFamily:"sans-serif",fontSize:14,outline:"none",marginBottom:14},placeholder:"Mot de passe",type:"password",value:authData.password,onChange:e=>setAuthData(d=>({...d,password:e.target.value})),onKeyDown:e=>e.key==="Enter"&&handleAuth()}),
      React.createElement("button",{style:{width:"100%",background:"#00E5A0",color:"#0A0E1A",border:"none",borderRadius:12,padding:15,fontFamily:"sans-serif",fontSize:16,fontWeight:800,cursor:"pointer",marginBottom:16},onClick:handleAuth,disabled:authLoading}, authLoading?"Chargement...":authMode==="login"?"Se connecter":"Créer mon compte"),
      React.createElement("p",{style:{textAlign:"center",fontSize:14,color:"#7B8DB0"}}, authMode==="login"?"Pas de compte ? ":"Déjà inscrit ? ", React.createElement("span",{style:{color:"#00E5A0",cursor:"pointer",fontWeight:600},onClick:()=>setAuthMode(authMode==="login"?"register":"login")}, authMode==="login"?"S'inscrire":"Se connecter"))
    )
  );

  return React.createElement("div", {style:{minHeight:"100vh",background:"#0A0E1A",color:"#F0F4FF",fontFamily:"sans-serif",maxWidth:430,margin:"0 auto"}},
    React.createElement("nav",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",position:"sticky",top:0,zIndex:100,background:"rgba(10,14,26,0.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.07)"}},
      React.createElement("span",{style:{fontFamily:"sans-serif",fontWeight:800,fontSize:20}}, "Num",React.createElement("span",{style:{color:"#00E5A0"}},"Afrik")),
      React.createElement("span",{style:{background:"#1C2537",border:"1px solid rgba(255,255,255,0.07)",borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:600}}, Math.round(user.credits||0)," cr."),
      React.createElement("span",{style:{width:38,height:38,borderRadius:"50%",background:"#00E5A0",color:"#0A0E1A",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,cursor:"pointer"},onClick:()=>{api.logout();setUser(null);}}, (user.name||"?")[0].toUpperCase())
    ),
    React.createElement("div",{style:{padding:"28px 20px 100px"}},
      React.createElement("div",{style:{marginBottom:4,fontSize:13,color:"#7B8DB0"}}, "Bonjour ",user.name?.split(" ")[0]||""," 👋"),
      React.createElement("h1",{style:{fontFamily:"sans-serif",fontSize:24,fontWeight:800,marginBottom:20}}, "Ton numéro virtuel ",React.createElement("span",{style:{color:"#00E5A0"}},"en quelques secondes")),
      React.createElement("div",{style:{background:"linear-gradient(135deg,#0D2B1F,#0A1F3A)",border:"1px solid rgba(0,229,160,0.2)",borderRadius:16,padding:20,marginBottom:20}},
        React.createElement("div",{style:{fontSize:11,color:"#7B8DB0",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}, "Solde disponible"),
        React.createElement("div",{style:{fontFamily:"sans-serif",fontSize:36,fontWeight:800,color:"#00E5A0"}}, Math.round(user.credits||0), React.createElement("span",{style:{fontSize:16,color:"#7B8DB0",marginLeft:4}}, "crédits")),
        React.createElement("div",{style:{display:"flex",gap:10,marginTop:16}},
          React.createElement("button",{style:{flex:1,background:"#00E5A0",color:"#0A0E1A",border:"none",borderRadius:10,padding:11,fontWeight:700,fontSize:14,cursor:"pointer"},onClick:()=>setModal("recharge")}, "⚡ Recharger"),
          React.createElement("button",{style:{flex:1,background:"#1C2537",color:"#F0F4FF",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:11,fontWeight:600,fontSize:14,cursor:"pointer"},onClick:()=>{setTab("history");loadHistory();}}, "📋 Historique")
        )
      ),
      React.createElement("h3",{style:{fontFamily:"sans-serif",fontSize:17,fontWeight:700,marginBottom:16}}, "Services populaires"),
      React.createElement("div",{style:{display:"flex",gap:12,overflowX:"auto",paddingBottom:4,marginBottom:20}},
        SERVICES.filter(s=>s.popular).map(s=>
          React.createElement("div",{key:s.id,onClick:()=>{setSelectedService(s);setSelectedCountry(null);loadCountries(s.id);},style:{minWidth:90,background:selectedService?.id===s.id?"rgba(0,229,160,0.06)":"#111827",border:`1px solid ${selectedService?.id===s.id?"#00E5A0":"rgba(255,255,255,0.07)"}`,borderRadius:16,padding:"16px 12px",textAlign:"center",cursor:"pointer",flexShrink:0}},
            React.createElement("div",{style:{fontSize:28,marginBottom:8}}, s.icon),
            React.createElement("div",{style:{fontSize:11,fontWeight:600,color:"#7B8DB0"}}, s.name.split(" / ")[0])
          )
        )
      ),
      selectedService && React.createElement("div",{style:{marginBottom:16,padding:"12px 16px",background:"#111827",borderRadius:12,border:"1px solid rgba(255,255,255,0.07)",fontSize:13}},
        React.createElement("span",{style:{color:"#7B8DB0"}}, "✅ ",selectedService.name," sélectionné — "),
        selectedCountry
          ? React.createElement("span",{style:{color:"#00E5A0",fontWeight:700}}, selectedCountry.code," — ",selectedCountry.totalFcfa," FCFA")
          : React.createElement("span",{style:{color:"#FF6B35",cursor:"pointer"},onClick:()=>setModal("countries")}, "Choisir un pays →")
      ),
      React.createElement("button",{style:{width:"100%",background:"linear-gradient(135deg,#00E5A0,#00C87A)",color:"#0A0E1A",border:"none",borderRadius:16,padding:16,fontFamily:"sans-serif",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:20},onClick:()=>selectedService&&selectedCountry?setModal("confirm"):setModal("services"),disabled:orderLoading}, orderLoading?"⟳ Chargement...":"⚡ Commander un numéro"),
      tab==="history" && React.createElement("div",null,
        React.createElement("h3",{style:{fontFamily:"sans-serif",fontSize:17,fontWeight:700,marginBottom:16}}, "Historique"),
        history.length===0
          ? React.createElement("p",{style:{color:"#7B8DB0",textAlign:"center",padding:40}}, "Aucune commande")
          : history.map(h=>React.createElement("div",{key:h.id,style:{background:"#111827",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:10}},
              React.createElement("span",{style:{fontSize:20}}, h.status==="RECEIVED"?"✅":h.status==="PENDING"?"⏳":"❌"),
              React.createElement("div",{style:{flex:1}},
                React.createElement("div",{style:{fontWeight:600,fontSize:14}}, h.service),
                React.createElement("div",{style:{fontSize:12,color:"#7B8DB0"}}, h.country)
              ),
              React.createElement("div",{style:{textAlign:"right"}},
                React.createElement("div",{style:{fontWeight:800,color:h.status==="RECEIVED"?"#00E5A0":h.status==="PENDING"?"#FF6B35":"#FF4757"}}, h.sms_code||h.status),
                React.createElement("div",{style:{fontSize:12,color:"#7B8DB0"}}, "-",h.cost_fcfa," FCFA")
              )
            ))
      )
    ),
    React.createElement("div",{style:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"rgba(17,24,39,0.95)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.07)",display:"flex",padding:"8px 0 20px"}},
      [["home","🏠","Accueil"],["order","⚡","Commander"],["history","📋","Historique"],["profile","👤","Profil"]].map(([id,icon,label])=>
        React.createElement("div",{key:id,style:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:8,cursor:"pointer"},onClick:()=>id==="order"?setModal("services"):(setTab(id),id==="history"&&loadHistory())},
          React.createElement("span",{style:{fontSize:20}}, icon),
          React.createElement("span",{style:{fontSize:10,fontWeight:600,color:tab===id?"#00E5A0":"#7B8DB0"}}, label)
        )
      )
    ),
    modal==="services" && React.createElement("div",{style:{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end"},onClick:e=>e.target===e.currentTarget&&setModal(null)},
      React.createElement("div",{style:{background:"#111827",borderRadius:"24px 24px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:"24px 20px 40px"}},
        React.createElement("div",{style:{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.07)",margin:"0 auto 20px"}}),
        React.createElement("h2",{style:{fontFamily:"sans-serif",fontSize:20,fontWeight:800,marginBottom:20}}, "Choisir un service"),
        SERVICES.map(s=>React.createElement("div",{key:s.id,onClick:()=>{setSelectedService(s);setSelectedCountry(null);loadCountries(s.id);setModal("countries");},style:{display:"flex",alignItems:"center",gap:12,padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,0.07)",cursor:"pointer"}},
          React.createElement("span",{style:{fontSize:28}}, s.icon),
          React.createElement("div",{style:{flex:1}},
            React.createElement("div",{style:{fontWeight:600}}, s.name),
            React.createElement("div",{style:{fontSize:12,color:"#7B8DB0"}}, "Disponible dans plusieurs pays")
          ),
          React.createElement("span",{style:{color:"#7B8DB0"}}, "›")
        ))
      )
    ),
    modal==="countries" && selectedService && React.createElement("div",{style:{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end"},onClick:e=>e.target===e.currentTarget&&setModal(null)},
      React.createElement("div",{style:{background:"#111827",borderRadius:"24px 24px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:"24px 20px 40px"}},
        React.createElement("div",{style:{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.07)",margin:"0 auto 20px"}}),
        React.createElement("h2",{style:{fontFamily:"sans-serif",fontSize:20,fontWeight:800,marginBottom:20}}, "Choisir un pays"),
        countriesLoading ? React.createElement("p",{style:{color:"#7B8DB0",textAlign:"center",padding:40}}, "Chargement...")
        : countries.slice(0,20).map(c=>React.createElement("div",{key:c.code,onClick:()=>{setSelectedCountry(c);setModal("confirm");},style:{display:"flex",alignItems:"center",gap:12,padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,0.07)",cursor:"pointer"}},
          React.createElement("span",{style:{fontSize:24}}, "🌍"),
          React.createElement("div",{style:{flex:1}},
            React.createElement("div",{style:{fontWeight:600}}, c.code),
            React.createElement("div",{style:{fontSize:12,color:"#7B8DB0"}}, c.count?.toLocaleString()," disponibles")
          ),
          React.createElement("span",{style:{background:"#00E5A0",color:"#0A0E1A",borderRadius:8,padding:"6px 12px",fontWeight:800}}, c.totalFcfa," F")
        ))
      )
    ),
    modal==="confirm" && selectedService && selectedCountry && React.createElement("div",{style:{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end"},onClick:e=>e.target===e.currentTarget&&setModal(null)},
      React.createElement("div",{style:{background:"#111827",borderRadius:"24px 24px 0 0",width:"100%",padding:"24px 20px 40px"}},
        React.createElement("div",{style:{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.07)",margin:"0 auto 20px"}}),
        React.createElement("h2",{style:{fontFamily:"sans-serif",fontSize:20,fontWeight:800,marginBottom:16}}, "Confirmer"),
        React.createElement("div",{style:{background:"#1C2537",borderRadius:12,padding:16,marginBottom:16,display:"flex",gap:12,alignItems:"center"}},
          React.createElement("span",{style:{fontSize:32}}, selectedService.icon),
          React.createElement("div",null,
            React.createElement("div",{style:{fontWeight:700}}, selectedService.name),
            React.createElement("div",{style:{fontSize:13,color:"#7B8DB0"}}, selectedCountry.code)
          )
        ),
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.07)"}},
          React.createElement("span",{style:{color:"#7B8DB0"}}, "Prix"),
          React.createElement("span",{style:{fontWeight:700,color:"#00E5A0"}}, selectedCountry.totalFcfa," FCFA")
        ),
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.07)"}},
          React.createElement("span",{style:{color:"#7B8DB0"}}, "Votre solde"),
          React.createElement("span",{style:{fontWeight:700,color:user.credits>=selectedCountry.totalFcfa?"#F0F4FF":"#FF4757"}}, Math.round(user.credits||0)," FCFA")
        ),
        React.createElement("div",{style:{background:"rgba(255,107,53,0.1)",border:"1px solid rgba(255,107,53,0.2)",borderRadius:10,padding:12,fontSize:13,color:"#FF6B35",margin:"16px 0",textAlign:"center"}}, "⏱ Remboursement automatique si pas de SMS en 20 min"),
        React.createElement("button",{style:{width:"100%",background:"#00E5A0",color:"#0A0E1A",border:"none",borderRadius:16,padding:16,fontFamily:"sans-serif",fontSize:16,fontWeight:800,cursor:"pointer",marginBottom:10},onClick:handleBuy,disabled:orderLoading}, orderLoading?"⟳ Activation...":"⚡ Activer — "+selectedCountry.totalFcfa+" FCFA"),
        React.createElement("button",{style:{width:"100%",background:"transparent",color:"#7B8DB0",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:14,fontFamily:"sans-serif",fontSize:15,cursor:"pointer"},onClick:()=>setModal(null)}, "Annuler")
      )
    ),
    modal==="active" && activeOrder && React.createElement("div",{style:{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end"}},
      React.createElement("div",{style:{background:"#111827",borderRadius:"24px 24px 0 0",width:"100%",padding:"24px 20px 40px"}},
        React.createElement("div",{style:{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.07)",margin:"0 auto 20px"}}),
        React.createElement("h2",{style:{fontFamily:"sans-serif",fontSize:20,fontWeight:800,marginBottom:16}}, smsCode?"✅ SMS Reçu !":"⏳ En attente..."),
        React.createElement("div",{style:{background:"linear-gradient(135deg,#0D2B1F,#091428)",border:"1px solid rgba(0,229,160,0.25)",borderRadius:16,padding:20,marginBottom:16}},
          React.createElement("div",{style:{fontSize:12,color:"#00E5A0",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}, "Votre numéro virtuel"),
          React.createElement("div",{style:{fontFamily:"sans-serif",fontSize:22,fontWeight:800,letterSpacing:2,cursor:"pointer"},onClick:()=>{navigator.clipboard?.writeText(activeOrder.phone);setCopied(true);setTimeout(()=>setCopied(false),2000);}}, activeOrder.phone),
          React.createElement("div",{style:{fontSize:12,color:"#00E5A0",marginTop:6}}, copied?"✅ Copié !":"📋 Appuyer pour copier"),
          !smsCode && React.createElement("div",null,
            React.createElement("div",{style:{height:6,background:"#1C2537",borderRadius:3,margin:"16px 0 8px",overflow:"hidden"}},
              React.createElement("div",{style:{height:"100%",width:`${(timer/1200)*100}%`,background:timer<120?"#FF4757":"#00E5A0",borderRadius:3,transition:"width 1s linear"}})
            ),
            React.createElement("div",{style:{fontSize:13,color:"#7B8DB0",textAlign:"right"}}, "Expiration dans ",formatTime(timer))
          )
        ),
        smsCode
          ? React.createElement("div",{style:{textAlign:"center",padding:"16px 0"}},
              React.createElement("div",{style:{fontSize:12,color:"#7B8DB0",marginBottom:8}}, "Code de vérification"),
              React.createElement("div",{style:{fontFamily:"sans-serif",fontSize:44,fontWeight:800,color:"#00E5A0",letterSpacing:8}}, smsCode),
              React.createElement("button",{style:{width:"100%",background:"#00E5A0",color:"#0A0E1A",border:"none",borderRadius:16,padding:16,fontFamily:"sans-serif",fontSize:16,fontWeight:800,cursor:"pointer",marginTop:16},onClick:()=>{setModal(null);setActiveOrder(null);setSmsCode(null);}}, "✅ Terminer")
            )
          : React.createElement("div",null,
              React.createElement("p",{style:{textAlign:"center",color:"#7B8DB0",fontSize:14,marginBottom:16}}, "Entrez ce numéro dans ",selectedService?.name?.split(" / ")[0],"..."),
              React.createElement("button",{style:{width:"100%",background:"rgba(255,71,87,0.15)",color:"#FF4757",border:"1px solid rgba(255,71,87,0.2)",borderRadius:16,padding:14,fontFamily:"sans-serif",fontSize:15,fontWeight:600,cursor:"pointer"},onClick:handleCancelOrder}, "🔄 Annuler et rembourser")
            )
      )
    ),
    modal==="recharge" && React.createElement("div",{style:{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end"},onClick:e=>e.target===e.currentTarget&&setModal(null)},
      React.createElement("div",{style:{background:"#111827",borderRadius:"24px 24px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:"24px 20px 40px"}},
        React.createElement("div",{style:{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.07)",margin:"0 auto 20px"}}),
        React.createElement("h2",{style:{fontFamily:"sans-serif",fontSize:20,fontWeight:800,marginBottom:6}}, "Recharger"),
        React.createElement("p",{style:{fontSize:13,color:"#7B8DB0",marginBottom:20}}, "Choisissez votre moyen de paiement"),
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}},
          PAYMENTS.map((p,i)=>React.createElement("div",{key:p.name,onClick:()=>setSelectedPayment(i),style:{background:"#1C2537",border:`2px solid ${selectedPayment===i?"#00E5A0":"rgba(255,255,255,0.07)"}`,borderRadius:12,padding:"14px 10px",textAlign:"center",cursor:"pointer"}},
            React.createElement("div",{style:{fontSize:24,marginBottom:6}}, p.icon),
            React.createElement("div",{style:{fontSize:13,fontWeight:700}}, p.name),
            React.createElement("div",{style:{fontSize:11,color:"#7B8DB0"}}, p.country)
          ))
        ),
        React.createElement("div",{style:{display:"grid",gridTemplateC
