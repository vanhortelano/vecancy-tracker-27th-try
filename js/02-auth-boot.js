// js/02-auth-boot.js — Start-up, sign in / sign up / sign out, login screen
let authPersistencePromise = Promise.resolve();

/* ---------------------------- boot ---------------------------- */

function boot(){
  initializeTheme();
  if (document.body.dataset.mode === "preview"){
    if (window.__previewBooted) return;
    window.__previewBooted = true;
    currentUser = {displayName:"Preview", email:"preview@local"};
    rooms = (window.SEED_ROOMS || []).map((room, index)=>({
      id: "preview-" + index,
      ...room,
      type: "Room",
      x: 20 + (index % 6) * 150,
      y: 20 + Math.floor(index / 6) * 130,
      beds: room.beds.map(bed=>({...bed, reservedFor:null}))
    }));
    shapes = [];
    prospects = [];
    temporaryClients = [];
    startClock();
    wireStaticUI();
    showApp();
    return;
  }
  wireLoginControls();
  wirePortal();
  showPortal();
  const cfg = window.FIREBASE_CONFIG;
  const notConfigured = !cfg || cfg.apiKey === "YOUR_API_KEY";
  if (notConfigured){
    document.getElementById("configWarning").style.display = "block";
    document.getElementById("signInBtn").disabled = true;
    document.getElementById("signUpBtn").disabled = true;
    document.getElementById("googleSignInBtn").disabled = true;
    document.getElementById("forgotPasswordBtn").disabled = true;
    return;
  }
  firebase.initializeApp(cfg);
  auth = firebase.auth();
  db = firebase.firestore();
  authPersistencePromise = auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

  document.getElementById("signInBtn").addEventListener("click", signIn);
  document.getElementById("signUpBtn").addEventListener("click", signUp);
  document.getElementById("googleSignInBtn").addEventListener("click", signInWithGoogle);
  document.getElementById("signOutBtn").addEventListener("click", ()=>{ portalLoginActive = false; auth.signOut(); });
  wireStaticUI();
  authPersistencePromise.then(()=>{
    if (location.protocol !== "file:"){
      auth.getRedirectResult().catch(err=>
        showAuthStatus("Google sign-in failed: " + authErrorMessage(err), true)
      );
    }

    auth.onAuthStateChanged(user=>{
      if (user){
        const allowed = window.ALLOWED_EMAILS || [];
        if (allowed.length && !allowed.includes(user.email)){
          alert("This account (" + user.email + ") is not authorized for this workspace.");
          auth.signOut();
          return;
        }
        if (currentUser && currentUser.uid !== user.uid) clearUserWorkspace();
        currentUser = user;
        showApp();
      } else {
        clearUserWorkspace();
        showLogin();
      }
    });
  }).catch(err=>{
    showAuthStatus("Could not establish a tab-only sign-in session: " + authErrorMessage(err), true);
    ["signInBtn","signUpBtn","googleSignInBtn"].forEach(id=>{
      document.getElementById(id).disabled = true;
    });
  });
}

function clearUserWorkspace(){
  currentUser = null;
  stopClock();
  stopDataSubscriptions();
  stopViewerAccess();
  if (typeof clStop === "function") clStop();
  tenantHistory = [];
  rooms = [];
  shapes = [];
  prospects = [];
  temporaryClients = [];
  assistantDataLoaded = {rooms:false,shapes:false,prospects:false,temporaryClients:false};
  lastHistoryPurge = 0;
  processingReservations.clear();
  extendState = null;
  transferState = null;
  editingRoomId = null;
  editingRoomBaseline = null;
  editingShapeId = null;
  activeTab = "dashboard";
  selectedShapeId = null;
  calOffset = 0;
  checkoutProximity = "all";
  checkoutPickerOpen = false;
  layoutLocked = true;
  ["filterGender","filterVacancy","filterDemographic"].forEach(id=>{
    const filter = document.getElementById(id);
    if (filter) filter.value = "all";
  });
  const search = document.getElementById("filterSearch");
  if (search) search.value = "";
  document.querySelectorAll(".modal-backdrop").forEach(modal=>{
    modal.classList.remove("open");
    modal.querySelectorAll("input,textarea").forEach(input=>{
      input.value = input.type === "color" ? input.defaultValue : "";
      if (input.type === "checkbox" || input.type === "radio") input.checked = false;
    });
    modal.querySelectorAll("select").forEach(select=>{ select.selectedIndex = 0; });
  });
  document.querySelectorAll("nav.tabs button").forEach(button=>button.classList.toggle("active", button.dataset.tab==="dashboard"));
  document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active", view.id==="view-dashboard"));
  if (typeof resetAssistantForUserChange === "function") resetAssistantForUserChange();
  if (document.getElementById("app").classList.contains("visible")){
    renderSharedOverview();
    renderDashboard();
    renderOverduePanel();
    renderHallway();
    renderAnalytics();
    renderMatrix();
    renderCalendar();
    renderReserve();
    renderTemporaryClients();
    renderHistory();
  }
}

function signIn(){
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password){
    showAuthStatus("Enter your email and password.", true);
    return;
  }
  authPersistencePromise.then(()=>auth.signInWithEmailAndPassword(email, password)).catch(err=>
    showAuthStatus("Sign-in failed: " + authErrorMessage(err), true)
  );
}

async function signUp(){
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const name = document.getElementById("nameInput").value.trim();
  if (!name){
    showAuthStatus("Enter your full name to create an account.", true);
    document.getElementById("nameInput").focus();
    return;
  }
  if (!email || !password){
    showAuthStatus("Enter your email and password.", true);
    return;
  }
  if (password.length < 6){
    showAuthStatus("Password must be at least 6 characters.", true);
    return;
  }
  try{
    await authPersistencePromise;
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    await credential.user.updateProfile({displayName:name});
  }catch(err){
    showAuthStatus("Account creation failed: " + authErrorMessage(err), true);
  }
}

async function signInWithGoogle(){
  try{
    await authPersistencePromise;
  }catch(err){
    showAuthStatus("Could not establish a tab-only sign-in session: " + authErrorMessage(err), true);
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err=>{
    if (err.code === "auth/popup-blocked" ||
        err.code === "auth/operation-not-supported-in-this-environment"){
      return auth.signInWithRedirect(provider).catch(redirectError=>
        showAuthStatus("Google sign-in failed: " + authErrorMessage(redirectError), true)
      );
    }
    if (err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request") return;
    showAuthStatus("Google sign-in failed: " + authErrorMessage(err), true);
  });
}

function authErrorMessage(error){
  const messages = {
    "auth/email-already-in-use":"An account already exists for this email. Sign in instead.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/weak-password":"Choose a stronger password (at least 6 characters).",
    "auth/user-not-found":"No account was found for this email.",
    "auth/wrong-password":"The password is incorrect.",
    "auth/invalid-credential":"The email or password is incorrect.",
    "auth/operation-not-allowed":"This sign-in method is disabled. Enable it in Firebase Authentication settings.",
    "auth/unauthorized-domain":"This site domain is not authorized in Firebase Authentication settings.",
    "auth/operation-not-supported-in-this-environment":"Open the app through HTTPS or localhost to use Google sign-in.",
    "auth/too-many-requests":"Too many attempts. Wait a little while, then try again.",
    "auth/network-request-failed":"Network error. Check your connection and try again."
  };
  return messages[error.code] || error.message || "Please try again.";
}

function wireLoginControls(){
  document.getElementById("loginTabBtn").addEventListener("click", ()=>setAuthMode("login"));
  document.getElementById("signupTabBtn").addEventListener("click", ()=>setAuthMode("signup"));
  document.getElementById("footerActionBtn").addEventListener("click", ()=>{
    setAuthMode(document.getElementById("signUpBtn").hidden ? "signup" : "login");
  });
  document.getElementById("passwordToggle").addEventListener("click", togglePasswordVisibility);
  document.getElementById("forgotPasswordBtn").addEventListener("click", sendPasswordReset);
  document.getElementById("password").addEventListener("keydown", event=>{
    if (event.key === "Enter") (document.getElementById("signUpBtn").hidden ? signIn : signUp)();
  });
  document.getElementById("email").addEventListener("keydown", event=>{
    if (event.key === "Enter") (document.getElementById("signUpBtn").hidden ? signIn : signUp)();
  });
  document.getElementById("email").addEventListener("input", ()=>showAuthStatus(""));

  ["heroThemeToggle", "mobileThemeToggle", "portalThemeToggle"].forEach(id=>{
    document.getElementById(id).addEventListener("click", toggleLoginTheme);
  });
}

function initializeTheme(){
  const darkTheme = localStorage.getItem("loginTheme") === "dark";
  document.body.classList.toggle("auth-dark", darkTheme);
  updateThemeControls(darkTheme);
  const appToggle = document.getElementById("appThemeToggle");
  if (appToggle) appToggle.addEventListener("click", toggleLoginTheme);
}

function updateThemeControls(isDark){
  document.querySelectorAll("#heroThemeToggle i, #mobileThemeToggle i, #portalThemeToggle i, #appThemeIcon").forEach(icon=>{
    icon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  });
  document.querySelectorAll("#heroThemeToggle, #mobileThemeToggle, #portalThemeToggle, #appThemeToggle").forEach(button=>{
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
}

function setAuthMode(mode){
  const isSignup = mode === "signup";
  document.querySelector(".auth-tabs").classList.toggle("signup-mode", isSignup);
  document.getElementById("loginTabBtn").classList.toggle("active", !isSignup);
  document.getElementById("signupTabBtn").classList.toggle("active", isSignup);
  document.getElementById("loginTabBtn").setAttribute("aria-selected", String(!isSignup));
  document.getElementById("signupTabBtn").setAttribute("aria-selected", String(isSignup));
  document.getElementById("formTitle").textContent = isSignup ? "Create your account" : "Welcome back";
  document.getElementById("formSubtitle").textContent = isSignup ? "Set up your dorm vacancy workspace." : "Sign in to manage dormitory vacancies.";
  document.getElementById("nameFieldContainer").hidden = !isSignup;
  document.getElementById("forgotPasswordBtn").hidden = isSignup;
  document.getElementById("signInBtn").hidden = isSignup;
  document.getElementById("signUpBtn").hidden = !isSignup;
  document.getElementById("footerPrompt").textContent = isSignup ? "Already have an account?" : "New to the tracker?";
  document.getElementById("footerActionBtn").textContent = isSignup ? "Sign in" : "Create an account";
  document.getElementById("password").autocomplete = isSignup ? "new-password" : "current-password";
  showAuthStatus("");
}

function toggleLoginTheme(){
  const isDark = !document.body.classList.contains("auth-dark");
  document.body.classList.toggle("auth-dark", isDark);
  localStorage.setItem("loginTheme", isDark ? "dark" : "light");
  updateThemeControls(isDark);
}

function togglePasswordVisibility(){
  const password = document.getElementById("password");
  const button = document.getElementById("passwordToggle");
  const visible = password.type === "password";
  password.type = visible ? "text" : "password";
  button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  button.innerHTML = `<i class="fa-solid ${visible ? "fa-eye-slash" : "fa-eye"}"></i>`;
}

async function sendPasswordReset(){
  const email = document.getElementById("email").value.trim();
  if (!email){
    showAuthStatus("Enter your email address first.", true);
    document.getElementById("email").focus();
    return;
  }
  try{
    await auth.sendPasswordResetEmail(email);
    showAuthStatus("Password reset email sent.");
  }catch(err){
    showAuthStatus("Could not send reset email: " + authErrorMessage(err), true);
  }
}

function showAuthStatus(message, isError=false){
  const status = document.getElementById("authStatus");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function showLogin(){
  document.getElementById("app").classList.remove("visible");
  if (portalLoginActive){
    document.getElementById("loginScreen").style.display = "flex";
    const roles = document.getElementById("roleScreen");
    if (roles) roles.hidden = true;
  } else if (document.getElementById("roleScreen") && document.getElementById("roleScreen").hidden){
    showPortal();
  }
}

function showApp(){
  const loginScreen = document.getElementById("loginScreen");
  if (loginScreen) loginScreen.style.display = "none";
  const roleScreen = document.getElementById("roleScreen");
  if (roleScreen) roleScreen.hidden = true;
  document.getElementById("app").classList.add("visible");
  startClock();
  document.getElementById("userName").textContent = currentUser.displayName || currentUser.email;
  const photo = document.getElementById("userPhoto");
if (photo) photo.src = currentUser.photoURL || "";
  if (db) subscribeData();
  if (typeof clStart === "function") clStart();
  renderActive();
}


/* ------------------- role selection portal -------------------
   The portal only decides WHICH sign-in appears. It never grants access:
   Branch Admin still goes through the normal Firebase sign-in, and the
   Dormitory Viewer still needs its own access code + password on viewer.html. */

let portalLoginActive = false;
let portalTrail = ["role"];

const PORTAL_LABELS = {
  role:"Role", admin:"Admin", viewer:"Viewer"
};

const PORTAL_SOON = {
  "marketing-viewer":{
    text:"The Marketing Viewer directory needs the central server to collect each branch's approved vacancy summary, and that isn't connected yet. To check one dormitory today, use Dormitory Viewer.",
    viewer:true
  }
};

function showPortal(step){
  const roles = document.getElementById("roleScreen");
  if (!roles) return;
  portalLoginActive = false;
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").classList.remove("visible");
  roles.hidden = false;
  portalTrail = [step || "role"];
  renderPortal(false);
}

function portalGo(step){
  portalTrail.push(step);
  renderPortal(true);
}

function portalBack(){
  if (portalTrail.length > 1) portalTrail.pop();
  renderPortal(true);
}

function renderPortal(moveFocus){
  const current = portalTrail[portalTrail.length - 1];
  const isSoon = current.indexOf("soon:") === 0;
  const stepName = isSoon ? "soon" : current;
  document.querySelectorAll("#roleScreen .portal-step").forEach(section=>{
    section.hidden = section.dataset.step !== stepName;
  });
  document.getElementById("portalBack").hidden = portalTrail.length < 2;
  document.getElementById("portalCrumbs").innerHTML = portalTrail.length < 2 ? "" :
    portalTrail.map(s=>"<li>" + (PORTAL_LABELS[s] || s) + "</li>").join("");
  if (isSoon){
    const info = PORTAL_SOON[current.slice(5)];
    document.getElementById("portalSoonText").textContent = info.text;
    document.getElementById("portalSoonBranch").hidden = !info.branch;
    document.getElementById("portalSoonViewer").hidden = !info.viewer;
  }
  if (moveFocus){
    const heading = document.querySelector('#roleScreen .portal-step[data-step="' + stepName + '"] h1');
    if (heading) heading.focus();
  }
}

function portalChoose(action){
  if (action === "branch-admin"){
    portalLoginActive = true;
    document.getElementById("roleScreen").hidden = true;
    document.getElementById("loginScreen").style.display = "flex";
    const email = document.getElementById("email");
    if (email) email.focus();
  } else if (action === "marketing-viewer"){
    location.href = "marketing.html";
  } else if (action === "super-admin"){
    location.href = "superadmin.html";
  } else if (action === "dormitory-viewer"){
    location.href = "viewer.html";
  }
}

function wirePortal(){
  const roles = document.getElementById("roleScreen");
  if (!roles) return;
  roles.addEventListener("click", event=>{
    const target = event.target.closest("[data-go],[data-action]");
    if (!target) return;
    if (target.dataset.go) portalGo(target.dataset.go);
    else portalChoose(target.dataset.action);
  });
  document.getElementById("portalBack").addEventListener("click", portalBack);
  document.getElementById("portalSoonBranch").addEventListener("click", ()=>portalChoose("branch-admin"));
  document.getElementById("portalSoonViewer").addEventListener("click", ()=>portalChoose("dormitory-viewer"));
  document.getElementById("backToRolesBtn").addEventListener("click", ()=>showPortal("role"));
  document.addEventListener("keydown", event=>{
    if (event.key === "Escape" && !roles.hidden && portalTrail.length > 1) portalBack();
  });
}
