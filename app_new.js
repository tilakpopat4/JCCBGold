// ==================== INITIAL SEED DATA ====================
const INITIAL_BRANCHES = [
    { code: "99", name: "HEAD OFFICE" },
    { code: "01", name: "AZADCHOWK BRANCH" },
    { code: "02", name: "JOSHIPARA BRANCH" },
    { code: "03", name: "DOLATPARA BRANCH" },
    { code: "04", name: "KODINAR BRANCH" },
    { code: "05", name: "KESHOD BRANCH" },
    { code: "06", name: "VANTHALI BRANCH" },
    { code: "07", name: "MANAVADAR BRANCH" },
    { code: "08", name: "GANDHINAGAR BRANCH" },
    { code: "09", name: "LIMBDI BRANCH" },
    { code: "10", name: "MENDARDA BRANCH" },
    { code: "11", name: "VISAVADAR BRANCH" },
    { code: "12", name: "JAMNAGAR BRANCH" },
    { code: "13", name: "BUS STAND BRANCH" },
    { code: "14", name: "LATHI BRANCH" },
    { code: "16", name: "AHMEDABAD BRANCH" },
    { code: "17", name: "RAJKOT BRANCH" }
];

const INITIAL_PRODUCTS = [
    { id: "1", code: "GW-3725", minAmt: 0, maxAmt: 50000, rate: 11.00, desc: "Gold Loan up to ₹50,000 (GW-3725) 11.00% FIX" },
    { id: "2", code: "GW-3725", minAmt: 50001, maxAmt: 100000, rate: 11.50, desc: "Gold Loan ₹50,001 to ₹100,000 (GW-3725) 11.50% FIX" },
    { id: "3", code: "GD-3524", minAmt: 100001, maxAmt: 200000, rate: 11.50, desc: "Gold Loan ₹100,001 to ₹200,000 (GD-3524) 11.50% FIX" },
    { id: "4", code: "GNA-3527", minAmt: 200001, maxAmt: 999999999, rate: 11.50, desc: "Gold Loan above ₹200,000 (GNA-3527) 11.50% FIX" },
    { id: "5", code: "GOD-3553", minAmt: 200001, maxAmt: 999999999, rate: 11.50, desc: "Gold Loan above ₹200,000 (Overdraft) (GOD-3553) 11.50% FIX" }
];

const INITIAL_VALUERS = [
    { id: "v1", name: "Soni Jamnadas Pragjibhai", mobile: "9825012345", address: "Zaveri Bazar, Junagadh", savingsAc: "002010100012345" },
    { id: "v2", name: "Soni Hareshbhai Dahyalal", mobile: "9426211223", address: "College Road, Junagadh", savingsAc: "002010100056789" }
];

const DEFAULT_ACCOUNT_SEEDS = {
    "GW-3725": 1001,
    "GD-3524": 5001,
    "GNA-3527": 8001,
    "GOD-3553": 9001
};

const LOGO_SRC = "jccb-logo.png";

let currentUploadedCustPhoto = "";
let currentUploadedGoldPhoto = "";
let currentUploadedMasterCustPhoto = "";
let currentPrintLoanId = null;
let cropperInstance = null;
let activeCropSource = null;

// Head Office Backup Globals
let savedDirHandle = null;
let lastAutoBackupDate = "";

// ==================== STATE MANAGEMENT ====================
let state = {
    branches: [],
    products: [],
    valuers: [],
    loans: [],
    customers: [],
    goldRates: {}, 
    accountSeeds: {}, 
    lastPacketSeed: 100, 
    currentSession: null,
    editingLoanId: null
};

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwc_px0IQX27lExLyvFlpnhPg0xJHu8_8_16ULQAzG11RYGuE0bCD3XY5U1Va4XMi21/exec";

let syncCounter = 0;
function showSync() {
    syncCounter++;
    const overlay = document.getElementById("sync-overlay");
    if (overlay) overlay.classList.remove("hidden");
}

function hideSync() {
    syncCounter--;
    if (syncCounter <= 0) {
        syncCounter = 0;
        const overlay = document.getElementById("sync-overlay");
        if (overlay) overlay.classList.add("hidden");
    }
}

async function loadState() {
    showSync();
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const data = await response.text();
        
        let stored = null;
        if (data && data.trim() !== "" && data.trim() !== "{}") {
            stored = data;
        }

        if (stored) {
            state = JSON.parse(stored);
            
            // Migrate old product codes (3527 -> GNA-3527, 3553 -> GOD-3553)
            if (state.products) {
                state.products.forEach(p => {
                    if (p.code === "3527") {
                        p.code = "GNA-3527";
                        p.desc = p.desc.replace("(3527)", "(GNA-3527)").replace("3527", "GNA-3527");
                    } else if (p.code === "3553") {
                        p.code = "GOD-3553";
                        p.desc = p.desc.replace("(3553)", "(GOD-3553)").replace("3553", "GOD-3553");
                    }
                });
            }

            if (state.loans) {
                state.loans.forEach(l => {
                    if (l.productCode === "3527") {
                        l.productCode = "GNA-3527";
                    } else if (l.productCode === "3553") {
                        l.productCode = "GOD-3553";
                    }
                });
            }

            if (state.accountSeeds) {
                Object.keys(state.accountSeeds).forEach(branchCode => {
                    const seeds = state.accountSeeds[branchCode];
                    if (seeds) {
                        if (seeds["3527"] !== undefined) {
                            seeds["GNA-3527"] = seeds["3527"];
                            delete seeds["3527"];
                        }
                        if (seeds["3553"] !== undefined) {
                            seeds["GOD-3553"] = seeds["3553"];
                            delete seeds["3553"];
                        }
                    }
                });
            }
            
            // Ensure state.customers exists
            if (!state.customers) state.customers = [];
            
            // Run migration for accountSeeds (from flat object to branch-nested objects)
            if (state.accountSeeds && !Object.values(state.accountSeeds).some(val => typeof val === 'object')) {
                const flatSeeds = { ...state.accountSeeds };
                state.accountSeeds = {};
                state.branches.forEach(b => {
                    state.accountSeeds[b.code] = { ...flatSeeds };
                });
            }
            
            // Ensure every branch has account seeds
            if (!state.accountSeeds) state.accountSeeds = {};
            state.branches.forEach(b => {
                if (!state.accountSeeds[b.code]) {
                    state.accountSeeds[b.code] = { ...DEFAULT_ACCOUNT_SEEDS };
                }
            });

            // Run migration for lastPacketSeed (from flat number to branch-nested numbers)
            if (typeof state.lastPacketSeed === 'number' || typeof state.lastPacketSeed === 'string') {
                const flatPacketSeed = parseInt(state.lastPacketSeed) || 100;
                state.lastPacketSeed = {};
                state.branches.forEach(b => {
                    state.lastPacketSeed[b.code] = flatPacketSeed;
                });
            }
            
            // Ensure every branch has lastPacketSeed
            if (!state.lastPacketSeed) state.lastPacketSeed = {};
            state.branches.forEach(b => {
                if (state.lastPacketSeed[b.code] === undefined) {
                    state.lastPacketSeed[b.code] = 100;
                }
            });
        } else {
            state.branches = [...INITIAL_BRANCHES];
            state.products = [...INITIAL_PRODUCTS];
            state.valuers = [...INITIAL_VALUERS];
            state.loans = [];
            state.customers = [];
            state.goldRates = {};
            
            state.accountSeeds = {};
            state.branches.forEach(b => {
                state.accountSeeds[b.code] = { ...DEFAULT_ACCOUNT_SEEDS };
            });
            
            state.lastPacketSeed = {};
            state.branches.forEach(b => {
                state.lastPacketSeed[b.code] = 100;
            });
            
            state.currentSession = null;
            await saveState();
        }
    } catch (e) {
        console.error("Error loading remote state", e);
        alert("Failed to connect to the central database. Please check your internet connection.");
    } finally {
        hideSync();
    }
}

async function saveState() {
    showSync();
    try {
        const dataStr = JSON.stringify(state);
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: dataStr,
            headers: {
                "Content-Type": "text/plain"
            }
        });
    } catch (e) {
        console.error("Error saving remote state", e);
        alert("Failed to sync data to the central database. Please check your internet connection.");
    } finally {
        hideSync();
    }
}

// ==================== UTILITY HELPERS ====================
function formatDateDMY(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    }
    return dateStr;
}

function getTodayDateStr() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function roundTo10(val) {
    return Math.round(val / 10) * 10;
}

function roundUpTo5(val) {
    return Math.ceil(val / 5) * 5;
}

// Convert Number to English Words (Indian numbering system: Lakhs, Crores)
function numberToWords(amount) {
    if (amount === 0) return "Rupees Zero Only";
    
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty ', 'Thirty ', 'Forty ', 'Fifty ', 'Sixty ', 'Seventy ', 'Eighty ', 'Ninety '];
    
    function numToWords2(n) {
        if (n < 20) return a[n];
        const digit = n % 10;
        return b[Math.floor(n / 10)] + (digit !== 0 ? a[digit] : '');
    }
    
    function numToWords3(n) {
        const hundred = Math.floor(n / 100);
        const rest = n % 100;
        let str = '';
        if (hundred > 0) {
            str += a[hundred] + 'Hundred ';
        }
        if (rest > 0) {
            if (hundred > 0) str += 'and ';
            str += numToWords2(rest);
        }
        return str;
    }
    
    let num = Math.floor(amount);
    let paise = Math.round((amount - num) * 100);
    
    let words = "Rupees ";
    
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    
    if (crore > 0) {
        words += numToWords3(crore) + "Crore ";
    }
    if (lakh > 0) {
        words += numToWords3(lakh) + "Lakh ";
    }
    if (thousand > 0) {
        words += numToWords3(thousand) + "Thousand ";
    }
    if (num > 0) {
        words += numToWords3(num);
    }
    
    words = words.trim() + " Only";
    
    if (paise > 0) {
        words += " and " + numToWords2(paise) + "Paise Only";
    }
    
    return words;
}

// ==================== TAB NAVIGATION ====================
function initTabs() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const tabId = item.getAttribute("data-tab");
            switchTab(tabId);
        });
    });

    const shortcuts = document.querySelectorAll("[data-go-tab]");
    shortcuts.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-go-tab");
            switchTab(tabId);
        });
    });

    const viewAllBtn = document.querySelector(".view-all-register-btn");
    if (viewAllBtn) {
        viewAllBtn.addEventListener("click", () => {
            switchTab("register-view");
        });
    }
}

function switchTab(tabId) {
    const contents = document.querySelectorAll(".tab-content");
    contents.forEach(content => content.classList.add("hidden"));

    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => item.classList.remove("active"));

    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.remove("hidden");
    }

    const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (activeBtn) {
        activeBtn.classList.add("active");
    }

    // Tab actions
    if (tabId === "dashboard-view") {
        updateDashboardStats();
    } else if (tabId === "entry-view") {
        prepareEntryForm();
    } else if (tabId === "register-view") {
        renderLoanRegister();
    } else if (tabId === "daily-vouchers-view") {
        prepareDailyVouchersView();
    } else if (tabId === "branch-master-view") {
        renderBranchMasterList();
    } else if (tabId === "valuer-master-view") {
        renderValuerMasterList();
    } else if (tabId === "customer-master-view") {
        renderCustomerMasterList();
    } else if (tabId === "product-master-view") {
        renderProductMasterList();
    } else if (tabId === "settings-view") {
        renderSettings();
    }
}

// ==================== AUTH & SESSION ====================
function initAuth() {
    const loginForm = document.getElementById("login-form");
    const loginBranchSelect = document.getElementById("login-branch");
    const loginPasswordInput = document.getElementById("login-password");
    const togglePasswordBtn = document.getElementById("toggle-password-btn");
    const loginError = document.getElementById("login-error");
    const logoutBtn = document.getElementById("logout-btn");

    function populateLoginBranches() {
        loginBranchSelect.innerHTML = "";
        state.branches.forEach(branch => {
            const option = document.createElement("option");
            option.value = branch.code;
            option.textContent = branch.code === "99" ? branch.name : `${branch.code} ${branch.name}`;
            loginBranchSelect.appendChild(option);
        });
    }

    populateLoginBranches();

    togglePasswordBtn.addEventListener("click", () => {
        const type = loginPasswordInput.type === "password" ? "text" : "password";
        loginPasswordInput.type = type;
        const icon = togglePasswordBtn.querySelector("i");
        icon.className = type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
    });

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const selectedBranchCode = loginBranchSelect.value;
        const enteredPassword = loginPasswordInput.value;

        const branch = state.branches.find(b => b.code === selectedBranchCode);
        if (!branch) return;

        let isValid = false;
        if (selectedBranchCode === "99") {
            isValid = (enteredPassword === "Rahul#80810");
        } else {
            isValid = (enteredPassword === "Admin@123");
        }

        if (isValid) {
            loginError.classList.add("hidden");
            state.currentSession = branch;
            saveState();
            enterApp();
        } else {
            loginError.classList.remove("hidden");
        }
    });

    logoutBtn.addEventListener("click", () => {
        state.currentSession = null;
        saveState();
        exitApp();
    });
}

function enterApp() {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");
    document.getElementById("current-user-branch").textContent = state.currentSession.code === "99" ? state.currentSession.name : `${state.currentSession.code} ${state.currentSession.name}`;
    document.getElementById("welcome-branch-name").textContent = state.currentSession.name;
    
    // RBAC Nav Menu
    const isAdmin = (state.currentSession.code === "99");
    const branchMasterNav = document.getElementById("branch-master-nav");
    const productMasterNav = document.getElementById("product-master-nav");
    const mastersNavDivider = document.getElementById("masters-nav-divider");
    
    if (isAdmin) {
        branchMasterNav.classList.remove("hidden");
        productMasterNav.classList.remove("hidden");
        mastersNavDivider.classList.remove("hidden");
    } else {
        branchMasterNav.classList.add("hidden");
        productMasterNav.classList.add("hidden");
    }
    
    // Toggle Backup Card display
    const hoBackupCard = document.getElementById("ho-backup-card");
    if (hoBackupCard) {
        hoBackupCard.style.display = isAdmin ? "block" : "none";
    }
    
    configureChargeInputsAccess();
    updateDashboardStats();
    startClock();
    switchTab("dashboard-view");
}

function configureChargeInputsAccess() {
    const isHO = (state.currentSession && state.currentSession.code === "99");
    const chargeInputs = [
        "charge-share-a",
        "charge-share-b",
        "charge-member-fee",
        "charge-valuation",
        "charge-stamp",
        "charge-service",
        "charge-document",
        "charge-insurance",
        "charge-cgst",
        "charge-sgst"
    ];

    chargeInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            if (isHO) {
                input.readOnly = false;
                input.classList.add("admin-editable");
            } else {
                input.readOnly = true;
                input.classList.remove("admin-editable");
            }
        }
    });
}

function exitApp() {
    document.getElementById("login-container").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
    document.getElementById("login-password").value = "";
    document.getElementById("login-error").classList.add("hidden");
}

function startClock() {
    const headerDate = document.getElementById("header-date");
    const headerTime = document.getElementById("header-time");

    function updateTime() {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        headerDate.textContent = `${dd}-${mm}-${yyyy}`;

        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        headerTime.textContent = `${hours}:${minutes} ${ampm}`;
    }

    updateTime();
    setInterval(updateTime, 1000 * 60);
}

// ==================== DASHBOARD VIEW ====================
function updateDashboardStats() {
    const totalAmountElem = document.getElementById("stat-total-amount");
    const totalAccountsElem = document.getElementById("stat-total-accounts");
    const totalWeightElem = document.getElementById("stat-total-weight");
    const totalValuersElem = document.getElementById("stat-total-valuers");
    const branchOnlyLoansElem = document.getElementById("stat-branch-only-loans");

    const isHeadOffice = (state.currentSession.code === "99");
    const viewLoans = isHeadOffice 
        ? state.loans 
        : state.loans.filter(l => l.branchCode === state.currentSession.code);

    branchOnlyLoansElem.textContent = isHeadOffice ? "All Branches Combined" : `Branch ${state.currentSession.code} Data`;

    const totalAmount = viewLoans.reduce((sum, item) => sum + parseFloat(item.loanAmount || 0), 0);
    const totalAccounts = viewLoans.length;
    const totalWeight = viewLoans.reduce((sum, item) => sum + parseFloat(item.goldWeight || 0), 0);
    const totalValuers = state.valuers.length;

    totalAmountElem.textContent = `₹${totalAmount.toLocaleString("en-IN")}`;
    totalAccountsElem.textContent = totalAccounts;
    totalWeightElem.textContent = `${totalWeight.toFixed(3)} g`;
    totalValuersElem.textContent = totalValuers;

    const todayStr = getTodayDateStr();
    const currentRate = state.goldRates[todayStr] || "";
    const rateInput = document.getElementById("dashboard-gold-rate");
    const saveRateBtn = document.getElementById("save-gold-rate-btn");
    const rateNote = document.querySelector(".rate-note");

    rateInput.value = currentRate;

    if (!isHeadOffice) {
        rateInput.disabled = true;
        saveRateBtn.disabled = true;
        saveRateBtn.style.display = "none";
        if (rateNote) {
            rateNote.textContent = currentRate 
                ? "* Today's gold rate set by Head Office." 
                : "* Today's gold rate has not been set by Head Office yet.";
        }
    } else {
        saveRateBtn.style.display = "inline-flex";
        if (currentRate) {
            rateInput.disabled = true;
            saveRateBtn.disabled = true;
            if (rateNote) {
                rateNote.textContent = "* Today's gold rate is locked.";
            }
        } else {
            rateInput.disabled = false;
            saveRateBtn.disabled = false;
            if (rateNote) {
                rateNote.textContent = "* Set once per calendar date (Locked for the day once saved)";
            }
        }
    }

    saveRateBtn.onclick = () => {
        if (!isHeadOffice) return;
        const rateVal = parseInt(rateInput.value);
        if (rateVal && rateVal > 1000) {
            state.goldRates[todayStr] = rateVal;
            saveState();
            alert(`Today's gold rate ₹${rateVal}/10g saved.`);
            updateDashboardStats();
            prepareEntryForm();
        } else {
            alert("Please enter a valid gold rate!");
        }
    };

    renderDashboardRecentTable(viewLoans);
}

function renderDashboardRecentTable(loansList) {
    const tbody = document.querySelector("#dashboard-recent-table tbody");
    tbody.innerHTML = "";

    const recent = [...loansList].reverse().slice(0, 5);

    if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No loans created today.</td></tr>`;
        return;
    }

    recent.forEach(loan => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${loan.accountNo}</strong></td>
            <td>${loan.borrowerName}</td>
            <td><span class="gold-badge">${loan.productCode}</span></td>
            <td>₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
            <td>Packet #${loan.packetNo}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==================== GOLD LOAN FORM ====================
function prepareEntryForm() {
    state.editingLoanId = null;
    const form = document.getElementById("gold-loan-form");
    if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Record & Generate Voucher';
        }
    }

    const loanDateInput = document.getElementById("loan-date");
    const valuerSelect = document.getElementById("valuer-select");
    const rateWarningAlert = document.getElementById("rate-missing-alert");
    const inlineRateInput = document.getElementById("inline-gold-rate");
    const inlineSaveBtn = document.getElementById("inline-save-rate-btn");

    if (form) {
        form.reset();
    }

    currentUploadedCustPhoto = "";
    currentUploadedGoldPhoto = "";
    const custPreview = document.getElementById("cust-photo-preview");
    if (custPreview) {
        custPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }
    const goldPreview = document.getElementById("gold-photo-preview");
    if (goldPreview) {
        goldPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }
    
    const isMemberSelect = document.getElementById("is-member");
    const memberNoInput = document.getElementById("member-no");
    const isNewMemberCheck = document.getElementById("is-new-member-checkbox");

    memberNoInput.required = false;
    isNewMemberCheck.checked = true; 
    isNewMemberCheck.disabled = true;

    const todayStr = getTodayDateStr();
    loanDateInput.value = todayStr;

    valuerSelect.innerHTML = '<option value="">-- Select Valuer --</option>';
    state.valuers.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = `${v.name} (${v.mobile})`;
        valuerSelect.appendChild(opt);
    });

    checkGoldRateForDate(todayStr);

    loanDateInput.addEventListener("change", () => {
        checkGoldRateForDate(loanDateInput.value);
        autoCalculatePacketNumber(loanDateInput.value);
        calculateCharges();
    });

    autoCalculatePacketNumber(todayStr);

    const inputsToWatch = [
        "loan-amount",
        "gold-weight",
        "is-member"
    ];
    inputsToWatch.forEach(id => {
        document.getElementById(id).addEventListener("input", calculateCharges);
        document.getElementById(id).addEventListener("change", calculateCharges);
    });

    const categorySelect = document.getElementById("loan-category-select");
    categorySelect.addEventListener("change", calculateCharges);

    // Manual edits of charges trigger updateTotals()
    const chargeInputs = [
        "charge-share-a",
        "charge-share-b",
        "charge-member-fee",
        "charge-valuation",
        "charge-stamp",
        "charge-service",
        "charge-document",
        "charge-insurance",
        "charge-cgst",
        "charge-sgst",
        "charge-adjustment"
    ];
    
    chargeInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            if (id === "charge-service") {
                input.addEventListener("input", () => {
                    const serviceVal = parseFloat(input.value) || 0;
                    const cgst = Math.round(serviceVal * 9 / 100);
                    const sgst = cgst;
                    document.getElementById("charge-cgst").value = cgst;
                    document.getElementById("charge-sgst").value = sgst;
                    updateTotals();
                });
                input.addEventListener("change", () => {
                    const serviceVal = parseFloat(input.value) || 0;
                    const cgst = Math.round(serviceVal * 9 / 100);
                    const sgst = cgst;
                    document.getElementById("charge-cgst").value = cgst;
                    document.getElementById("charge-sgst").value = sgst;
                    updateTotals();
                });
            } else {
                input.addEventListener("input", updateTotals);
                input.addEventListener("change", updateTotals);
            }
        }
    });

    isMemberSelect.addEventListener("change", () => {
        if (isMemberSelect.value === "Yes") {
            memberNoInput.required = true;
            isNewMemberCheck.checked = false;
            isNewMemberCheck.disabled = true;
        } else {
            memberNoInput.required = false;
            memberNoInput.value = "";
            isNewMemberCheck.checked = true;
            isNewMemberCheck.disabled = true;
        }
        calculateCharges();
    });

    inlineSaveBtn.onclick = (e) => {
        e.preventDefault();
        const targetDate = loanDateInput.value;
        const rateVal = parseInt(inlineRateInput.value);
        if (rateVal && rateVal > 1000) {
            state.goldRates[targetDate] = rateVal;
            saveState();
            checkGoldRateForDate(targetDate);
            calculateCharges();
        } else {
            alert("Please enter a valid gold rate.");
        }
    };

    const custNoInput = document.getElementById("cust-no");
    if (custNoInput) {
        const handleLookup = () => {
            const custNo = custNoInput.value.trim();
            if (custNo) {
                let customer = state.customers.find(c => c.custNo === custNo);
                
                // Fallback: If not found in customers profiles directory, search historical loans globally across all branches
                if (!customer) {
                    const matchingLoans = state.loans.filter(l => l.custNo === custNo);
                    if (matchingLoans.length > 0) {
                        const latestLoan = matchingLoans[matchingLoans.length - 1];
                        customer = {
                            custNo: latestLoan.custNo,
                            memberNo: latestLoan.memberNo,
                            name: latestLoan.borrowerName,
                            address: latestLoan.custAddress,
                            savingsAc: latestLoan.custSavingsAc,
                            age: latestLoan.custAge,
                            occupation: latestLoan.custOccupation,
                            religion: latestLoan.custReligion,
                            mobile: latestLoan.custMobile,
                            nomineeName: latestLoan.custNomineeName,
                            nomineeRelation: latestLoan.custNomineeRelation,
                            photo: latestLoan.custPhoto
                        };
                    }
                }

                if (customer) {
                    document.getElementById("cust-name").value = customer.name || "";
                    document.getElementById("cust-address").value = customer.address || "";
                    document.getElementById("cust-savings-ac").value = customer.savingsAc || "";
                    document.getElementById("cust-age").value = customer.age || "";
                    document.getElementById("cust-occupation").value = customer.occupation || "";
                    document.getElementById("cust-religion").value = customer.religion || "";
                    document.getElementById("cust-mobile").value = customer.mobile || "";
                    document.getElementById("cust-nominee-name").value = customer.nomineeName || "";
                    document.getElementById("cust-nominee-relation").value = customer.nomineeRelation || "";
                    
                    // Autofill membership details
                    if (customer.memberNo && customer.memberNo !== "-") {
                        document.getElementById("is-member").value = "Yes";
                        document.getElementById("member-no").value = customer.memberNo;
                    } else {
                        document.getElementById("is-member").value = "No";
                        document.getElementById("member-no").value = "";
                    }
                    
                    if (customer.photo) {
                        currentUploadedCustPhoto = customer.photo;
                        document.getElementById("cust-photo-preview").innerHTML = `<img src="${customer.photo}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    } else {
                        currentUploadedCustPhoto = "";
                        document.getElementById("cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
                    }
                    calculateCharges();
                }
            }
        };
        custNoInput.addEventListener("blur", handleLookup);
        custNoInput.addEventListener("change", handleLookup);
    }
}

function checkGoldRateForDate(dateStr) {
    const rateWarningAlert = document.getElementById("rate-missing-alert");
    const valRateDisplay = document.getElementById("val-rate-display");
    const rate = state.goldRates[dateStr] || null;

    if (rate) {
        rateWarningAlert.classList.add("hidden");
        valRateDisplay.textContent = `₹${rate.toLocaleString("en-IN")}`;
    } else {
        rateWarningAlert.classList.remove("hidden");
        valRateDisplay.textContent = `₹0 (Not Set)`;
        
        const isHO = (state.currentSession && state.currentSession.code === "99");
        const inlineInput = document.getElementById("inline-gold-rate");
        const inlineBtn = document.getElementById("inline-save-rate-btn");
        const warningText = rateWarningAlert.querySelector("span");
        
        if (isHO) {
            if (inlineInput) inlineInput.style.display = "inline-block";
            if (inlineBtn) inlineBtn.style.display = "inline-block";
            if (warningText) {
                warningText.innerHTML = `<strong>Warning:</strong> Gold market rate is not set for today. Set rate in dashboard or enter here:`;
            }
        } else {
            if (inlineInput) inlineInput.style.display = "none";
            if (inlineBtn) inlineBtn.style.display = "none";
            if (warningText) {
                warningText.innerHTML = `<strong>Warning:</strong> Today's gold market rate is not set by the Head Office. Please contact Head Office to set the rate.`;
            }
        }
    }
}

function autoCalculatePacketNumber(dateStr) {
    const packetNoInput = document.getElementById("packet-no");
    
    if (state.editingLoanId) {
        const loan = state.loans.find(l => l.id === state.editingLoanId);
        if (loan) {
            packetNoInput.value = loan.packetNo;
            return;
        }
    }
    
    const branchCode = state.currentSession ? state.currentSession.code : "99";
    
    let seed = 100;
    if (state.lastPacketSeed && state.lastPacketSeed[branchCode] !== undefined) {
        seed = parseInt(state.lastPacketSeed[branchCode]) || 100;
    }
    
    let maxPacket = seed;
    
    state.loans.forEach(loan => {
        if (loan.branchCode === branchCode) {
            const pNum = parseInt(loan.packetNo);
            if (!isNaN(pNum) && pNum > maxPacket) {
                maxPacket = pNum;
            }
        }
    });

    packetNoInput.value = maxPacket + 1;
}

function calculateCharges() {
    const loanAmountInput = document.getElementById("loan-amount");
    const goldWeightInput = document.getElementById("gold-weight");
    const isNewMemberCheck = document.getElementById("is-new-member-checkbox");
    const loanDateVal = document.getElementById("loan-date").value;
    const isMember = document.getElementById("is-member").value;

    const amount = parseFloat(loanAmountInput.value) || 0;
    const weight = parseFloat(goldWeightInput.value) || 0;
    const marketRate = state.goldRates[loanDateVal] || 0;
    const isNewMember = isNewMemberCheck.checked;

    let matchedProduct = null;
    const matchingProducts = state.products.filter(p => amount >= p.minAmt && amount <= p.maxAmt);
    
    if (matchingProducts.length > 0) {
        matchedProduct = matchingProducts[0];
    }

    const categoryDisplay = document.getElementById("loan-category-display");
    const categorySelect = document.getElementById("loan-category-select");
    const rateDisplay = document.getElementById("interest-rate-display");
    const acNoInput = document.getElementById("loan-ac-no");

    let productCode = "";
    let interestRateVal = "";

    if (amount > 200000) {
        categoryDisplay.classList.add("hidden");
        categorySelect.classList.remove("hidden");
        if (!categorySelect.value) {
            const isOverdraft = confirm("Is this loan an Overdraft (GOD-3553)?\n\nClick OK for GOD-3553 (Overdraft)\nClick Cancel for GNA-3527 (Installment)");
            categorySelect.value = isOverdraft ? "GOD-3553" : "GNA-3527";
        }
        productCode = categorySelect.value;
        categoryDisplay.value = productCode; // Ensure display input has the value for form submit
        const matchingProd = state.products.find(p => p.code === productCode && amount >= p.minAmt && amount <= p.maxAmt);
        if (matchingProd) {
            interestRateVal = `${matchingProd.rate.toFixed(2)}%`;
        } else {
            interestRateVal = "11.50%";
        }
    } else {
        categoryDisplay.classList.remove("hidden");
        categorySelect.classList.add("hidden");
        categorySelect.value = ""; // Reset select value for future transitions above 200k
        
        if (matchedProduct && amount > 0) {
            categoryDisplay.value = matchedProduct.code;
            productCode = matchedProduct.code;
            interestRateVal = `${matchedProduct.rate.toFixed(2)}%`;
        } else {
            categoryDisplay.value = "";
            productCode = "";
            interestRateVal = "";
        }
    }

    if (productCode && amount > 0) {
        rateDisplay.value = interestRateVal;
        
        if (state.editingLoanId) {
            const loan = state.loans.find(l => l.id === state.editingLoanId);
            if (loan && loan.productCode === productCode) {
                acNoInput.value = loan.accountNo;
            } else {
                acNoInput.value = generateNextAccountNumber(productCode);
            }
        } else {
            acNoInput.value = generateNextAccountNumber(productCode);
        }
    } else {
        rateDisplay.value = "";
        acNoInput.value = "";
    }

    const marketValue = Math.round((weight / 10) * marketRate);
    const eligibleAmount = Math.round(marketValue * 0.75);
    
    document.getElementById("val-market-val-display").textContent = `₹${marketValue.toLocaleString("en-IN")}`;
    document.getElementById("val-eligible-display").textContent = `₹${eligibleAmount.toLocaleString("en-IN")}`;

    let ltv = 0;
    if (marketValue > 0) {
        ltv = Math.round((amount / marketValue) * 100);
    }
    document.getElementById("val-ltv-display").textContent = `${ltv}%`;

    const ltvWarning = document.getElementById("ltv-warning-badge");
    if (ltv > 75) {
        ltvWarning.classList.remove("hidden");
    } else {
        ltvWarning.classList.add("hidden");
    }

    let shareA = 0;
    let shareB = 0;
    let memberFee = 0;
    let valuationCharge = 0;
    let stampCharge = 0;
    let serviceCharge = 0;
    let docCharge = 0;
    let insCharge = 0;

    if (amount > 0) {
        if (isNewMember) {
            if (amount <= 100000) {
                shareB = 50;
            } else if (amount > 100000) {
                shareA = 500;
            }
        }

        if (amount > 100000 && isMember === "No") {
            memberFee = 25;
        }

        // Valuation Fee (0.25% of loan, rounded up to nearest 5)
        if (amount <= 25000) {
            valuationCharge = 100;
        } else if (amount <= 50000) {
            valuationCharge = 150;
        } else if (amount <= 100000) {
            valuationCharge = 250;
        } else if (amount <= 500000) {
            valuationCharge = Math.min(1000, roundUpTo5(amount * 0.25 / 100));
        } else if (amount <= 1000000) {
            valuationCharge = Math.min(1500, roundUpTo5(amount * 0.25 / 100));
        } else {
            valuationCharge = Math.min(2000, roundUpTo5(amount * 0.25 / 100));
        }

        // Stamp Charge
        if (amount <= 50000) {
            stampCharge = 0;
        } else {
            const calculated = roundTo10(Math.round(amount * 0.25 / 100));
            stampCharge = Math.min(300, calculated);
        }

        if (amount > 200000 && (productCode === "GOD-3553" || productCode === "3553")) {
            stampCharge += 300;
        }

        // Service Charge
        if (amount <= 200000) {
            serviceCharge = Math.min(500, roundTo10(Math.round(amount * 0.25 / 100)));
        } else {
            serviceCharge = Math.min(5000, roundTo10(Math.round(amount * 0.50 / 100)));
        }

        // Document Charge
        if (amount <= 100000) {
            docCharge = 50;
        } else if (amount <= 200000) {
            docCharge = 100;
        } else {
            docCharge = 200;
        }

        // Insurance Charge
        if (amount <= 200000) {
            insCharge = 50;
        } else {
            insCharge = 100;
        }
    }

    const cgst = Math.round(serviceCharge * 9 / 100);
    const sgst = cgst;

    document.getElementById("charge-share-a").value = shareA;
    document.getElementById("charge-share-b").value = shareB;
    document.getElementById("charge-member-fee").value = memberFee;
    document.getElementById("charge-valuation").value = valuationCharge;
    document.getElementById("charge-stamp").value = stampCharge;
    document.getElementById("charge-service").value = serviceCharge;
    document.getElementById("charge-document").value = docCharge;
    document.getElementById("charge-insurance").value = insCharge;
    document.getElementById("charge-cgst").value = cgst;
    document.getElementById("charge-sgst").value = sgst;

    updateTotals();
}

function updateTotals() {
    const loanAmountInput = document.getElementById("loan-amount");
    const amount = parseFloat(loanAmountInput.value) || 0;

    const shareA = parseFloat(document.getElementById("charge-share-a").value) || 0;
    const shareB = parseFloat(document.getElementById("charge-share-b").value) || 0;
    const memberFee = parseFloat(document.getElementById("charge-member-fee").value) || 0;
    const valuationCharge = parseFloat(document.getElementById("charge-valuation").value) || 0;
    const stampCharge = parseFloat(document.getElementById("charge-stamp").value) || 0;
    const serviceCharge = parseFloat(document.getElementById("charge-service").value) || 0;
    const docCharge = parseFloat(document.getElementById("charge-document").value) || 0;
    const insCharge = parseFloat(document.getElementById("charge-insurance").value) || 0;
    const cgst = parseFloat(document.getElementById("charge-cgst").value) || 0;
    const sgst = parseFloat(document.getElementById("charge-sgst").value) || 0;
    const adjustment = parseFloat(document.getElementById("charge-adjustment").value) || 0;

    const totalDeductions = shareA + shareB + memberFee + valuationCharge + stampCharge + serviceCharge + docCharge + insCharge + cgst + sgst + adjustment;
    const roundedTotalDeductions = Math.round(totalDeductions * 100) / 100;
    document.getElementById("charge-total").value = roundedTotalDeductions;

    const netDisbursal = Math.max(0, amount - roundedTotalDeductions);
    const roundedNetDisbursal = Math.round(netDisbursal * 100) / 100;

    document.getElementById("summary-sanctioned-amt").textContent = `₹${amount.toLocaleString("en-IN")}`;
    document.getElementById("summary-deductions-amt").textContent = `₹${roundedTotalDeductions.toLocaleString("en-IN")}`;
    document.getElementById("summary-net-disbursal").textContent = `₹${roundedNetDisbursal.toLocaleString("en-IN")}`;
}

function generateNextAccountNumber(schemeCode) {
    let branchCode = state.currentSession ? state.currentSession.code : "99";
    if (state.editingLoanId) {
        const loan = state.loans.find(l => l.id === state.editingLoanId);
        if (loan) {
            branchCode = loan.branchCode;
        }
    }
    
    let seed = 1001;
    if (state.accountSeeds[branchCode] && state.accountSeeds[branchCode][schemeCode] !== undefined) {
        seed = parseInt(state.accountSeeds[branchCode][schemeCode]);
    } else {
        seed = DEFAULT_ACCOUNT_SEEDS[schemeCode] || 1001;
    }
    
    let maxSerial = seed - 1;

    state.loans.forEach(loan => {
        if (loan.branchCode === branchCode && loan.productCode === schemeCode) {
            let num = 0;
            if (loan.accountNo.includes("-")) {
                const parts = loan.accountNo.split("-");
                num = parseInt(parts[parts.length - 1]);
            } else {
                num = parseInt(loan.accountNo);
            }
            if (!isNaN(num) && num > maxSerial) {
                maxSerial = num;
            }
        }
    });

    const nextNum = maxSerial + 1;
    return `${schemeCode}-${nextNum}`;
}

// Save Entry Form
function initFormSubmit() {
    const form = document.getElementById("gold-loan-form");
    
    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const dateStr = document.getElementById("loan-date").value;
        const rate = state.goldRates[dateStr] || 0;
        if (rate <= 0) {
            alert("Error: Gold market rate is not set for this date! Configure it before saving.");
            return;
        }

        const valuerId = document.getElementById("valuer-select").value;
        if (!valuerId) {
            alert("Please select a Soni Valuer.");
            return;
        }

        const amount = parseFloat(document.getElementById("loan-amount").value);
        const weight = parseFloat(document.getElementById("gold-weight").value);
        const marketValue = Math.round((weight / 10) * rate);
        if (amount > marketValue * 0.75) {
            const confirmLTV = confirm("Warning: Loan amount exceeds 75% of gold value. Do you still want to proceed?");
            if (!confirmLTV) return;
        }

        const confirmSave = confirm(state.editingLoanId ? "Are you sure you want to update this gold loan entry?" : "Are you sure you want to save this gold loan entry?");
        if (!confirmSave) return;

        if (state.editingLoanId) {
            const index = state.loans.findIndex(l => l.id === state.editingLoanId);
            if (index !== -1) {
                state.loans[index] = {
                    ...state.loans[index],
                    date: dateStr,
                    loanStatus: form.elements["loan-status"].value,
                    isMember: document.getElementById("is-member").value,
                    memberNo: document.getElementById("member-no").value || "-",
                    isNewMember: document.getElementById("is-new-member-checkbox").checked,
                    packetNo: document.getElementById("packet-no").value,
                    valuerId: valuerId,
                    borrowerName: document.getElementById("cust-name").value,
                    loanAmount: amount,
                    productCode: document.getElementById("loan-category-display").value,
                    accountNo: document.getElementById("loan-ac-no").value,
                    interestRate: document.getElementById("interest-rate-display").value,
                    goldWeight: weight,
                    ornamentsDesc: document.getElementById("ornaments-desc").value,
                    marketRate: rate,
                    marketValue: marketValue,
                    eligibleAmount: Math.round(marketValue * 0.75),
                    
                    // Customer fields
                    custNo: document.getElementById("cust-no").value.trim(),
                    custAddress: document.getElementById("cust-address").value.trim(),
                    custSavingsAc: document.getElementById("cust-savings-ac").value.trim(),
                    custAge: parseInt(document.getElementById("cust-age").value) || 0,
                    custOccupation: document.getElementById("cust-occupation").value.trim(),
                    custReligion: document.getElementById("cust-religion").value.trim(),
                    custMobile: document.getElementById("cust-mobile").value.trim(),
                    custNomineeName: document.getElementById("cust-nominee-name").value.trim(),
                    custNomineeRelation: document.getElementById("cust-nominee-relation").value.trim(),
                    custPhoto: currentUploadedCustPhoto,
                    goldPhoto: currentUploadedGoldPhoto,
                    loanPurpose: document.getElementById("loan-purpose").value.trim(),
                    
                    // Charges
                    shareA: parseFloat(document.getElementById("charge-share-a").value) || 0,
                    shareB: parseFloat(document.getElementById("charge-share-b").value) || 0,
                    memberFee: parseFloat(document.getElementById("charge-member-fee").value) || 0,
                    valuationCharge: parseFloat(document.getElementById("charge-valuation").value) || 0,
                    stampCharge: parseFloat(document.getElementById("charge-stamp").value) || 0,
                    serviceCharge: parseFloat(document.getElementById("charge-service").value) || 0,
                    docCharge: parseFloat(document.getElementById("charge-document").value) || 0,
                    insCharge: parseFloat(document.getElementById("charge-insurance").value) || 0,
                    cgst: parseFloat(document.getElementById("charge-cgst").value) || 0,
                    sgst: parseFloat(document.getElementById("charge-sgst").value) || 0,
                    adjustment: parseFloat(document.getElementById("charge-adjustment").value) || 0,
                    totalCharges: parseFloat(document.getElementById("charge-total").value) || 0,
                    netDisbursal: amount - (parseFloat(document.getElementById("charge-total").value) || 0)
                };
                
                upsertCustomerFromForm();
                saveState();
                alert("Gold loan entry updated successfully.");
                const updatedLoan = state.loans[index];
                
                state.editingLoanId = null;
                
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Record & Generate Voucher';
                
                switchTab("register-view");
                openPrintModal(updatedLoan.id);
            }
        } else {
            const newLoan = {
                id: "loan_" + Date.now(),
                date: dateStr,
                branchCode: state.currentSession.code,
                branchName: state.currentSession.name,
                loanStatus: form.elements["loan-status"].value,
                isMember: document.getElementById("is-member").value,
                memberNo: document.getElementById("member-no").value || "-",
                isNewMember: document.getElementById("is-new-member-checkbox").checked,
                packetNo: document.getElementById("packet-no").value,
                valuerId: valuerId,
                borrowerName: document.getElementById("cust-name").value,
                loanAmount: amount,
                productCode: document.getElementById("loan-category-display").value,
                accountNo: document.getElementById("loan-ac-no").value,
                interestRate: document.getElementById("interest-rate-display").value,
                goldWeight: weight,
                ornamentsDesc: document.getElementById("ornaments-desc").value,
                marketRate: rate,
                marketValue: marketValue,
                eligibleAmount: Math.round(marketValue * 0.75),
                
                // Customer fields
                custNo: document.getElementById("cust-no").value.trim(),
                custAddress: document.getElementById("cust-address").value.trim(),
                custSavingsAc: document.getElementById("cust-savings-ac").value.trim(),
                custAge: parseInt(document.getElementById("cust-age").value) || 0,
                custOccupation: document.getElementById("cust-occupation").value.trim(),
                custReligion: document.getElementById("cust-religion").value.trim(),
                custMobile: document.getElementById("cust-mobile").value.trim(),
                custNomineeName: document.getElementById("cust-nominee-name").value.trim(),
                custNomineeRelation: document.getElementById("cust-nominee-relation").value.trim(),
                custPhoto: currentUploadedCustPhoto,
                goldPhoto: currentUploadedGoldPhoto,
                loanPurpose: document.getElementById("loan-purpose").value.trim(),
                
                // Charges
                shareA: parseFloat(document.getElementById("charge-share-a").value) || 0,
                shareB: parseFloat(document.getElementById("charge-share-b").value) || 0,
                memberFee: parseFloat(document.getElementById("charge-member-fee").value) || 0,
                valuationCharge: parseFloat(document.getElementById("charge-valuation").value) || 0,
                stampCharge: parseFloat(document.getElementById("charge-stamp").value) || 0,
                serviceCharge: parseFloat(document.getElementById("charge-service").value) || 0,
                docCharge: parseFloat(document.getElementById("charge-document").value) || 0,
                insCharge: parseFloat(document.getElementById("charge-insurance").value) || 0,
                cgst: parseFloat(document.getElementById("charge-cgst").value) || 0,
                sgst: parseFloat(document.getElementById("charge-sgst").value) || 0,
                adjustment: parseFloat(document.getElementById("charge-adjustment").value) || 0,
                totalCharges: parseFloat(document.getElementById("charge-total").value) || 0,
                netDisbursal: amount - (parseFloat(document.getElementById("charge-total").value) || 0)
            };

            state.loans.push(newLoan);
            upsertCustomerFromForm();
            saveState();

            alert("Gold loan entry saved successfully.");
            openPrintModal(newLoan.id);
        }

        prepareEntryForm();
        updateDashboardStats();
    });

    document.getElementById("reset-loan-form-btn").onclick = () => {
        if (confirm("Reset all form inputs?")) {
            prepareEntryForm();
        }
    };
}

// ==================== LOAN LEDGER REGISTER ====================
function renderLoanRegister() {
    const tbody = document.getElementById("register-tbody");
    const emptyMsg = document.getElementById("register-empty-msg");
    const filterBranchSelect = document.getElementById("filter-branch");
    const filterProductSelect = document.getElementById("filter-product");

    filterBranchSelect.innerHTML = '<option value="">-- All Branches --</option>';
    state.branches.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.code;
        opt.textContent = b.code === "99" ? b.name : `${b.code} ${b.name}`;
        filterBranchSelect.appendChild(opt);
    });

    filterProductSelect.innerHTML = '<option value="">-- All Schemes --</option>';
    const uniqueCodes = [...new Set(state.products.map(p => p.code))];
    uniqueCodes.forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code;
        filterProductSelect.appendChild(opt);
    });

    function runFilters() {
        const query = document.getElementById("filter-search").value.toLowerCase();
        const branchCode = filterBranchSelect.value;
        const dateFrom = document.getElementById("filter-date-from").value;
        const dateTo = document.getElementById("filter-date-to").value;
        const productCode = filterProductSelect.value;

        const isHeadOffice = (state.currentSession.code === "99");
        let list = state.loans;
        if (!isHeadOffice) {
            list = list.filter(l => l.branchCode === state.currentSession.code);
        }

        const filtered = list.filter(loan => {
            const matchesQuery = !query || 
                loan.borrowerName.toLowerCase().includes(query) || 
                loan.accountNo.toLowerCase().includes(query) || 
                loan.packetNo.toString().includes(query);
            
            const matchesBranch = !branchCode || loan.branchCode === branchCode;
            const matchesProduct = !productCode || loan.productCode === productCode;
            
            let matchesDate = true;
            if (dateFrom && loan.date < dateFrom) matchesDate = false;
            if (dateTo && loan.date > dateTo) matchesDate = false;

            return matchesQuery && matchesBranch && matchesProduct && matchesDate;
        });

        tbody.innerHTML = "";
        if (filtered.length === 0) {
            emptyMsg.classList.remove("hidden");
            return;
        }
        emptyMsg.classList.add("hidden");

        const sorted = [...filtered].reverse();

        sorted.forEach(loan => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${formatDateDMY(loan.date)}</td>
                <td><small>${loan.branchCode} ${loan.branchName.replace(" BRANCH", "")}</small></td>
                <td><strong>${loan.accountNo}</strong></td>
                <td>Packet #${loan.packetNo}</td>
                <td>${loan.borrowerName}</td>
                <td><small class="gold-badge">${loan.productCode}</small></td>
                <td>₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</td>
                <td>${parseFloat(loan.goldWeight).toFixed(3)}g</td>
                <td>₹${parseFloat(loan.totalCharges).toLocaleString("en-IN")}</td>
                <td class="bold-text green-color">₹${parseFloat(loan.netDisbursal).toLocaleString("en-IN")}</td>
                <td>
                    <button class="btn btn-secondary-sm" onclick="openPrintModal('${loan.id}')">
                        <i class="fa-solid fa-print"></i> Print
                    </button>
                </td>
                <td>
                    ${isHeadOffice ? `
                        <div class="action-group">
                            <button class="btn-icon btn-icon-green" title="Edit" onclick="editLoanRecord('${loan.id}')">
                                <i class="fa-solid fa-pencil"></i>
                            </button>
                            <button class="btn-icon btn-icon-red" title="Delete" onclick="deleteLoanRecord('${loan.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    ` : '<span class="text-muted">-</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    const filters = ["filter-search", "filter-branch", "filter-date-from", "filter-date-to", "filter-product"];
    filters.forEach(id => {
        document.getElementById(id).oninput = runFilters;
        document.getElementById(id).onchange = runFilters;
    });

    document.getElementById("clear-filters-btn").onclick = () => {
        document.getElementById("filter-search").value = "";
        document.getElementById("filter-branch").value = "";
        document.getElementById("filter-date-from").value = "";
        document.getElementById("filter-date-to").value = "";
        document.getElementById("filter-product").value = "";
        runFilters();
    };

    document.getElementById("export-csv-btn").onclick = () => {
        exportLoansToCSV();
    };

    runFilters();
}

function deleteLoanRecord(loanId) {
    if (state.currentSession.code !== "99") {
        alert("Permission Denied: Only Head Office can delete loan records.");
        return;
    }
    const confirmDel = confirm("Warning: Are you sure you want to permanently delete this loan record?");
    if (!confirmDel) return;

    state.loans = state.loans.filter(l => l.id !== loanId);
    saveState();
    alert("Record deleted.");
    renderLoanRegister();
    updateDashboardStats();
}

function editLoanRecord(loanId) {
    if (state.currentSession.code !== "99") {
        alert("Permission Denied: Only Head Office can edit loan records.");
        return;
    }
    
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) {
        alert("Error: Loan record not found.");
        return;
    }

    state.editingLoanId = loanId;
    switchTab("entry-view");

    document.getElementById("loan-date").value = loan.date;
    
    const statusRadios = document.getElementsByName("loan-status");
    statusRadios.forEach(radio => {
        if (radio.value === loan.loanStatus) {
            radio.checked = true;
        }
    });

    const isMemberSelect = document.getElementById("is-member");
    const memberNoInput = document.getElementById("member-no");
    const isNewMemberCheck = document.getElementById("is-new-member-checkbox");

    isMemberSelect.value = loan.isMember;
    if (loan.isMember === "Yes") {
        memberNoInput.required = true;
        memberNoInput.value = loan.memberNo;
        isNewMemberCheck.checked = false;
    } else {
        memberNoInput.required = false;
        memberNoInput.value = "";
        isNewMemberCheck.checked = true;
    }
    isNewMemberCheck.disabled = true;

    document.getElementById("packet-no").value = loan.packetNo;
    document.getElementById("valuer-select").value = loan.valuerId;
    
    document.getElementById("cust-no").value = loan.custNo || "";
    document.getElementById("cust-name").value = loan.borrowerName || "";
    document.getElementById("cust-address").value = loan.custAddress || "";
    document.getElementById("cust-savings-ac").value = loan.custSavingsAc || "";
    document.getElementById("cust-age").value = loan.custAge || "";
    document.getElementById("cust-occupation").value = loan.custOccupation || "";
    document.getElementById("cust-religion").value = loan.custReligion || "";
    document.getElementById("cust-mobile").value = loan.custMobile || "";
    document.getElementById("cust-nominee-name").value = loan.custNomineeName || "";
    document.getElementById("cust-nominee-relation").value = loan.custNomineeRelation || "";
    document.getElementById("loan-purpose").value = loan.loanPurpose || "";

    if (loan.custPhoto) {
        currentUploadedCustPhoto = loan.custPhoto;
        document.getElementById("cust-photo-preview").innerHTML = `<img src="${loan.custPhoto}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
    } else {
        currentUploadedCustPhoto = "";
        document.getElementById("cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }

    if (loan.goldPhoto) {
        currentUploadedGoldPhoto = loan.goldPhoto;
        document.getElementById("gold-photo-preview").innerHTML = `<img src="${loan.goldPhoto}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
    } else {
        currentUploadedGoldPhoto = "";
        document.getElementById("gold-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
    }

    document.getElementById("loan-amount").value = loan.loanAmount;
    document.getElementById("gold-weight").value = loan.goldWeight;
    document.getElementById("ornaments-desc").value = loan.ornamentsDesc;
    document.getElementById("charge-adjustment").value = loan.adjustment;
    
    if (loan.loanAmount > 200000) {
        document.getElementById("loan-category-select").value = loan.productCode;
    }

    const form = document.getElementById("gold-loan-form");
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Update Loan Entry';

    calculateCharges();
}

function exportLoansToCSV() {
    const isHeadOffice = (state.currentSession.code === "99");
    let list = state.loans;
    if (!isHeadOffice) {
        list = list.filter(l => l.branchCode === state.currentSession.code);
    }

    if (list.length === 0) {
        alert("No records to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = [
        "Date", "Branch Code", "Branch Name", "Account No", "Packet No", 
        "Borrower Name", "Loan Status", "Member Status", "Member No", 
        "Gold Weight(g)", "Market Rate", "Market Value", "Sanctioned Amount", 
        "Valuation Charge", "Stamp Duty", "Service Charge", "Doc Charge", 
        "Insurance", "CGST", "SGST", "Adjustment", "Total Deductions", "Net Disbursed"
    ];
    csvContent += headers.join(",") + "\r\n";

    list.forEach(l => {
        const row = [
            l.date, l.branchCode, `"${l.branchName}"`, `"${l.accountNo}"`, l.packetNo,
            `"${l.borrowerName}"`, l.loanStatus, l.isMember, l.memberNo,
            l.goldWeight, l.marketRate, l.marketValue, l.loanAmount,
            l.valuationCharge, l.stampCharge, l.serviceCharge, l.docCharge,
            l.insCharge, l.cgst, l.sgst, l.adjustment, l.totalCharges, l.netDisbursal
        ];
        csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `JCCB_Gold_Loans_${getTodayDateStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== HEAD OFFICE DATA BACKUP CENTER ====================
// Store handle in IndexedDB
async function saveDirHandleToDB(handle) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("JCCB_Backup_DB", 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.createObjectStore("handles");
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction("handles", "readwrite");
            const store = tx.objectStore("handles");
            store.put(handle, "dirHandle");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    });
}

// Retrieve handle from IndexedDB
async function getDirHandleFromDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open("JCCB_Backup_DB", 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.createObjectStore("handles");
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction("handles", "readonly");
            const store = tx.objectStore("handles");
            const getReq = store.get("dirHandle");
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

async function loadSavedBackupHandle() {
    try {
        const handle = await getDirHandleFromDB();
        if (handle) {
            savedDirHandle = handle;
            const permission = await savedDirHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                updateBackupUI(savedDirHandle.name, false);
            } else {
                updateBackupUI(savedDirHandle.name, true);
            }
        }
    } catch (e) {
        console.warn("Failed to load saved directory handle from DB:", e);
    }
}

function generateBranchCSVContent(branchLoans) {
    const headers = [
        "Date", "Account No", "Packet No", "Borrower Name", "Savings A/c No", 
        "Mobile No", "Age", "Occupation", "Religion", "Nominee Name", 
        "Nominee Relation", "Scheme Code", "Gold Weight (g)", "Market Rate (/10g)", 
        "Market Value", "Sanctioned Amount", "Interest Rate", "Ornaments Description", 
        "Soni Valuer Name", "Share Capital A", "Share Capital B", "Member Fee", 
        "Valuation Fee", "Stamp Duty", "Service Charge", "Document Charge", 
        "Insurance Charge", "CGST", "SGST", "Adjustment", "Total Deductions", 
        "Net Disbursal Amount"
    ];

    let csvContent = headers.join(",") + "\r\n";

    branchLoans.forEach(l => {
        const valuer = state.valuers.find(v => v.id === l.valuerId) || { name: l.valuerId };
        const row = [
            l.date || "",
            `"${l.accountNo || ''}"`,
            l.packetNo || "",
            `"${l.borrowerName || ''}"`,
            `"${l.custSavingsAc || ''}"`,
            `"${l.custMobile || ''}"`,
            l.custAge || 0,
            `"${l.custOccupation || ''}"`,
            `"${l.custReligion || ''}"`,
            `"${l.custNomineeName || ''}"`,
            `"${l.custNomineeRelation || ''}"`,
            `"${l.productCode || ''}"`,
            l.goldWeight || 0,
            l.marketRate || 0,
            l.marketValue || 0,
            l.loanAmount || 0,
            `"${l.interestRate || ''}"`,
            `"${l.ornamentsDesc || ''}"`,
            `"${valuer.name || ''}"`,
            l.shareA || 0,
            l.shareB || 0,
            l.memberFee || 0,
            l.valuationCharge || 0,
            l.stampCharge || 0,
            l.serviceCharge || 0,
            l.docCharge || 0,
            l.insCharge || 0,
            l.cgst || 0,
            l.sgst || 0,
            l.adjustment || 0,
            l.totalCharges || 0,
            l.netDisbursal || 0
        ];
        csvContent += row.join(",") + "\r\n";
    });

    return csvContent;
}

function updateBackupUI(dirName, needsActivation = false) {
    const statusText = document.getElementById("backup-folder-status");
    const pathText = document.getElementById("backup-folder-path");
    const statusDot = document.getElementById("backup-status-dot");
    const syncBtn = document.getElementById("btn-ho-backup-manual");
    const selectBtn = document.getElementById("btn-ho-backup-select");

    if (dirName) {
        if (needsActivation) {
            statusText.textContent = "Requires Activation";
            statusText.className = "text-warning";
            pathText.innerHTML = `Connected directory: <strong>${dirName}</strong>. Click "Re-Authorize Folder" to restore daily 6:00 PM auto-backup.`;
            statusDot.style.backgroundColor = "var(--warning)";
            statusDot.style.boxShadow = "0 0 8px var(--warning)";
            syncBtn.style.display = "none";
            selectBtn.innerHTML = '<i class="fa-solid fa-key"></i> Re-Authorize Folder';
        } else {
            statusText.textContent = "Active";
            statusText.className = "text-green";
            pathText.innerHTML = `Connected directory: <strong>${dirName}</strong>. Ready for 6:00 PM auto-backup.`;
            statusDot.style.backgroundColor = "var(--success)";
            statusDot.style.boxShadow = "0 0 8px var(--success)";
            syncBtn.style.display = "inline-flex";
            selectBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Select Different Folder';
        }
    } else {
        statusText.textContent = "Not Set";
        statusText.className = "text-red";
        pathText.textContent = "Select a folder to enable daily 6:00 PM auto-backup.";
        statusDot.style.backgroundColor = "var(--danger)";
        statusDot.style.boxShadow = "0 0 8px var(--danger)";
        syncBtn.style.display = "none";
        selectBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Select Folder & Back Up Now';
    }
}

async function selectNewBackupFolder() {
    try {
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
        savedDirHandle = handle;
        try {
            await saveDirHandleToDB(handle);
        } catch (e) {
            console.warn("Failed to save handle to IndexedDB:", e);
        }
        updateBackupUI(savedDirHandle.name, false);
        await backupAllBranchesData(false);
    } catch (err) {
        console.error("Folder picker cancelled or failed:", err);
        if (err.name !== "AbortError") {
            alert("Folder picker not supported or permission denied. Exporting via browser downloads fallback...");
            backupViaDownloadsFallback();
        }
    }
}

async function backupAllBranchesData(isAuto) {
    if (!savedDirHandle) {
        console.warn("Backup triggered but no folder handle saved.");
        return;
    }

    try {
        const options = { mode: 'readwrite' };
        const permission = await savedDirHandle.queryPermission(options);
        if (permission !== 'granted') {
            if (isAuto) {
                console.warn("Auto-backup failed: folder permission not granted. Updating UI.");
                updateBackupUI(savedDirHandle.name, true);
                return;
            } else {
                const req = await savedDirHandle.requestPermission(options);
                if (req !== 'granted') {
                    alert("Permission denied to write to folder.");
                    return;
                }
            }
        }

        let successCount = 0;
        for (const branch of state.branches) {
            const branchLoans = state.loans.filter(l => l.branchCode === branch.code);
            const csvContent = generateBranchCSVContent(branchLoans);
            const fileName = `Branch_${branch.code}_${branch.name.replace(/\s+/g, '_')}.csv`;
            
            const fileHandle = await savedDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            
            const encoder = new TextEncoder();
            const encoded = encoder.encode("\ufeff" + csvContent);
            await writable.write(encoded);
            await writable.close();
            successCount++;
        }

        if (isAuto) {
            showToastNotification(`Daily 6:00 PM Auto-Backup Completed successfully! Saved ${successCount} branch files.`);
        } else {
            alert(`Backup completed successfully! Saved ${successCount} branch CSV files to folder: ${savedDirHandle.name}`);
        }
    } catch (err) {
        console.error("Backup process error:", err);
        if (isAuto) {
            showToastNotification("Daily Auto-Backup encountered an error writing files.");
        } else {
            alert("Error during backup: " + err.message);
        }
    }
}

function backupViaDownloadsFallback() {
    let successCount = 0;
    state.branches.forEach(branch => {
        const branchLoans = state.loans.filter(l => l.branchCode === branch.code);
        const csvContent = generateBranchCSVContent(branchLoans);
        const fileName = `Branch_${branch.code}_${branch.name.replace(/\s+/g, '_')}.csv`;
        
        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        successCount++;
    });
    alert(`Downloaded ${successCount} branch CSV files to your default Downloads folder.`);
}

function showToastNotification(message) {
    let toast = document.querySelector(".toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${message}</span>`;
    
    setTimeout(() => {
        toast.classList.add("show");
    }, 100);

    setTimeout(() => {
        toast.classList.remove("show");
    }, 5000);
}

function initAutoBackupScheduler() {
    setInterval(() => {
        const now = new Date();
        const hrs = now.getHours();
        const mins = now.getMinutes();
        
        if (hrs === 18 && mins === 0) {
            const todayStr = getTodayDateStr();
            if (lastAutoBackupDate !== todayStr) {
                lastAutoBackupDate = todayStr;
                if (savedDirHandle) {
                    backupAllBranchesData(true);
                } else {
                    console.warn("Daily 6:00 PM backup skipped: No folder selected yet.");
                }
            }
        }
    }, 1000 * 30);
}

// ==================== DAILY CREDIT VOUCHERS MANAGER ====================
function prepareDailyVouchersView() {
    const voucherDateSelect = document.getElementById("voucher-date-select");
    if (!voucherDateSelect.value) {
        voucherDateSelect.value = getTodayDateStr();
    }

    loadDailyVouchersSummary();

    document.getElementById("load-vouchers-btn").onclick = () => {
        loadDailyVouchersSummary();
    };

    document.getElementById("print-vouchers-btn").onclick = () => {
        printDailyVouchers();
    };
}

function getDailyVouchersData(dateStr) {
    const isHeadOffice = (state.currentSession.code === "99");
    
    let dayLoans = state.loans.filter(l => l.date === dateStr);
    if (!isHeadOffice) {
        dayLoans = dayLoans.filter(l => l.branchCode === state.currentSession.code);
    }

    let shareA = 0;
    let shareB = 0;
    let memberFee = 0;
    let stamp = 0;
    let service = 0;
    let doc = 0;
    let insurance = 0;
    let sgst = 0;
    let cgst = 0;

    let valuerChargesMap = {};

    dayLoans.forEach(loan => {
        shareA += parseFloat(loan.shareA || 0);
        shareB += parseFloat(loan.shareB || 0);
        memberFee += parseFloat(loan.memberFee || 0);
        stamp += parseFloat(loan.stampCharge || 0);
        service += parseFloat(loan.serviceCharge || 0);
        doc += parseFloat(loan.docCharge || 0);
        insurance += parseFloat(loan.insCharge || 0);
        sgst += parseFloat(loan.sgst || 0);
        cgst += parseFloat(loan.cgst || 0);

        if (loan.valuationCharge && loan.valuationCharge > 0) {
            valuerChargesMap[loan.valuerId] = (valuerChargesMap[loan.valuerId] || 0) + parseFloat(loan.valuationCharge);
        }
    });

    const voucherAccounts = [
        { key: "shareA", code: "GL-150040-SHARE APPLICATION MONEY (GROUP-A)", title: "Share Application Money (Group A)", amount: shareA },
        { key: "shareB", code: "GL-150058-SHARE APPLICATION MONEY (GROUP-B)", title: "Share Application Money (Group B)", amount: shareB },
        { key: "memberFee", code: "GL-160067-MBMBER FEE", title: "Member Fee", amount: memberFee },
        { key: "stamp", code: "GL-370065-ADHESIV STAMP ADVANCE", title: "Stamp Charges", amount: stamp },
        { key: "service", code: "GL-160063-SERVICE CHARGE INCOME", title: "Service Charge Income", amount: service },
        { key: "doc", code: "GL-160181-DOCUMENT CHARGE INCOME", title: "Document Charge Income", amount: doc },
        { key: "insurance", code: "GL-150050-INSURANCE DEPOSIT", title: "Insurance Deposit", amount: insurance },
        { key: "sgst", code: "GL-370260-SGST PAYABLE", title: "SGST Payable", amount: sgst },
        { key: "cgst", code: "GL-370261-CGST PAYABLE", title: "CGST Payable", amount: cgst }
    ];

    let activeVouchers = voucherAccounts.filter(v => v.amount > 0);

    for (let valuerId in valuerChargesMap) {
        const valuerSum = valuerChargesMap[valuerId];
        if (valuerSum > 0) {
            const valuer = state.valuers.find(v => v.id === valuerId) || { name: valuerId, savingsAc: "-" };
            activeVouchers.push({
                key: "valuer_" + valuerId,
                code: `A/C: ${valuer.savingsAc} - VALUER CHARGE`,
                title: `Valuer Valuation: ${valuer.name}`,
                amount: valuerSum,
                isValuer: true,
                valuerName: valuer.name,
                valuerAc: valuer.savingsAc
            });
        }
    }

    return activeVouchers;
}

function loadDailyVouchersSummary() {
    const tbody = document.getElementById("daily-vouchers-tbody");
    tbody.innerHTML = "";
    
    const dateStr = document.getElementById("voucher-date-select").value;
    const vouchers = getDailyVouchersData(dateStr);

    if (vouchers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No transactions or deductions found on ${formatDateDMY(dateStr)}.</td></tr>`;
        return;
    }

    vouchers.forEach(v => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${v.title}</strong></td>
            <td><code>${v.code}</code></td>
            <td class="bold-text">₹${v.amount.toLocaleString("en-IN")}.00</td>
            <td><small class="text-muted">${numberToWords(v.amount)}</small></td>
        `;
        tbody.appendChild(tr);
    });
}

function printDailyVouchers() {
    const dateStr = document.getElementById("voucher-date-select").value;
    const vouchers = getDailyVouchersData(dateStr);

    if (vouchers.length === 0) {
        alert("No transaction entries to print on this date.");
        return;
    }

    const printArea = document.getElementById("print-area");
    printArea.innerHTML = "";

    let html = "";
    const vouchersPerPage = 3;
    const totalPages = Math.ceil(vouchers.length / vouchersPerPage);

    for (let page = 0; page < totalPages; page++) {
        const isLastPage = (page === totalPages - 1);
        const pageClass = isLastPage ? "print-voucher print-a4-three" : "print-voucher print-a4-three print-page-break";
        
        html += `<div class="${pageClass}">`;

        for (let i = 0; i < vouchersPerPage; i++) {
            const vIndex = (page * vouchersPerPage) + i;
            if (vIndex >= vouchers.length) {
                html += `<div class="three-part-segment" style="border:none; visibility:hidden;"></div>`;
                continue;
            }

            const voucher = vouchers[vIndex];
            const isLastInPage = (i === vouchersPerPage - 1);
            
            html += `
                <div class="three-part-segment" style="padding: 10px 0;">
                    <div class="voucher-print-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center;">
                            <img src="${LOGO_SRC}" alt="JCCB Logo" class="print-bank-logo" style="width:38px; height:38px; border-radius:50%; border:1px solid #000; margin-right:8px;">
                            <div class="bank-info">
                                <h2 class="bank-title" style="font-size: 13.5px; font-weight:800; margin:0; color:#000;">The Junagadh Commercial Co-operative Bank Ltd.</h2>
                                <p class="bank-subtitle" style="font-size: 10.5px; margin:2px 0 0 0; font-weight:600; color:#000;">Branch: ${state.currentSession.code} - ${state.currentSession.name}</p>
                            </div>
                        </div>
                        <div class="voucher-badge" style="font-size: 11.5px; font-weight:800; border: 1.5px solid #000; padding: 3px 8px; text-transform: uppercase;">CASH CREDIT VOUCHER</div>
                    </div>

                    <div class="print-meta-grid-three" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:8px; border:1.5px solid #000000; padding:6px 10px; font-size:12px; font-weight:700;">
                        <div><strong>Voucher Date:</strong> ${formatDateDMY(dateStr)}</div>
                        <div><strong>Voucher No:</strong> JV-${dateStr.replace(/-/g, "")}-${vIndex + 1}</div>
                        <div><strong>Account Head:</strong> Credits Ledger</div>
                    </div>

                    <div style="border: 1.5px solid #000000; padding: 12px; font-size: 12.5px; margin-bottom: 5px; flex: 1; display:flex; flex-direction:column; justify-content:space-between; background-color:#ffffff; color:#000000;">
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px; border-bottom:1.5px solid #000000; padding-bottom:4px;">
                                <span style="font-weight:800;">Account Header: ${voucher.code}</span>
                                <span style="font-weight:900; font-size:13.5px;">₹ ${voucher.amount.toLocaleString("en-IN")}.00</span>
                            </div>
                            <div style="font-size:12px; margin-bottom: 6px;">
                                <strong>Amount in Words:</strong> <em style="font-weight:700;">${numberToWords(voucher.amount)}</em>
                            </div>
                        </div>
                        
                        <div style="font-size: 12.5px; font-weight: 700; color: #000000; text-align: center; margin: 10px 0; border: 1.5px dashed #000000; padding: 8px 6px; border-radius: 4px; background-color: #fafafa; line-height: 1.3;">
                            Particulars: Being aggregated credit sum of ${voucher.title} for Gold Loans on ${formatDateDMY(dateStr)}.
                        </div>
                    </div>

                    <div class="print-signatures-row-three" style="display:flex; justify-content:space-between; margin-top: 15px;">
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Clerk / Cashier</div>
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Officer</div>
                        <div class="sig-block" style="font-size:10.5px; font-weight:800; text-align:center; border-top: 1.5px solid #000000; width: 22%; padding-top:4px; color:#000000;">Manager</div>
                    </div>

                    ${!isLastInPage ? `<div class="tear-line-indicator" style="text-align:center; margin: 12px 0; font-size: 11px; border-top: 1.5px dashed #000; padding-top: 4px;"><i class="fa-solid fa-scissors"></i> Tear here -------------------------------------------------------------</div>` : ''}
                </div>
            `;
        }

        html += `</div>`;
    }

    printArea.innerHTML = html;
    window.print();
}

// ==================== BRANCH MASTER VIEW ====================
function renderBranchMasterList() {
    const tbody = document.getElementById("branch-list-tbody");
    tbody.innerHTML = "";

    state.branches.forEach(b => {
        const tr = document.createElement("tr");
        const isHO = (b.code === "99");
        const passwordLabel = isHO ? "Rahul#80810" : "Admin@123";
        
        tr.innerHTML = `
            <td><strong>${b.code}</strong></td>
            <td>${b.name}</td>
            <td><code class="text-muted">${passwordLabel}</code></td>
            <td>
                ${isHO ? '<span class="text-muted">Read-Only</span>' : `
                    <button class="btn-icon btn-icon-red" onclick="deleteBranch('${b.code}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `}
            </td>
        `;
        tbody.appendChild(tr);
    });

    const form = document.getElementById("branch-master-form");
    form.onsubmit = (e) => {
        e.preventDefault();
        if (state.currentSession.code !== "99") {
            alert("Error: Only Head Office can add branch records.");
            return;
        }
        const code = document.getElementById("branch-code").value.trim().padStart(2, '0');
        const name = document.getElementById("branch-name").value.trim().toUpperCase() + " BRANCH";

        if (state.branches.some(b => b.code === code)) {
            alert("This branch code already exists!");
            return;
        }

        state.branches.push({ code, name });
        
        if (!state.accountSeeds) state.accountSeeds = {};
        state.accountSeeds[code] = { ...DEFAULT_ACCOUNT_SEEDS };
        if (!state.lastPacketSeed) state.lastPacketSeed = {};
        state.lastPacketSeed[code] = 100;

        saveState();
        alert("Branch added successfully.");
        form.reset();
        renderBranchMasterList();
        initAuth();
    };
}

function deleteBranch(code) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can delete branch records.");
        return;
    }
    if (code === "99") return;
    if (confirm(`Are you sure you want to delete branch ${code}?`)) {
        state.branches = state.branches.filter(b => b.code !== code);
        saveState();
        renderBranchMasterList();
        initAuth();
    }
}

// ==================== VALUER MASTER VIEW ====================
function renderValuerMasterList() {
    const tbody = document.getElementById("valuer-list-tbody");
    tbody.innerHTML = "";

    state.valuers.forEach(v => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${v.name}</strong></td>
            <td>${v.mobile}</td>
            <td><small>${v.address}</small></td>
            <td><code>${v.savingsAc}</code></td>
            <td>
                <button class="btn-icon btn-icon-red" onclick="deleteValuer('${v.id}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const form = document.getElementById("valuer-master-form");
    form.onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById("valuer-name").value.trim();
        const mobile = document.getElementById("valuer-mobile").value.trim();
        const address = document.getElementById("valuer-address").value.trim();
        const savingsAc = document.getElementById("valuer-savings-ac").value.trim();

        const newValuer = {
            id: "valuer_" + Date.now(),
            name, mobile, address, savingsAc
        };

        state.valuers.push(newValuer);
        saveState();
        alert("Valuer registered successfully.");
        form.reset();
        renderValuerMasterList();
    };
}

function deleteValuer(id) {
    if (confirm("Delete this valuer?")) {
        state.valuers = state.valuers.filter(v => v.id !== id);
        saveState();
        renderValuerMasterList();
    }
}

// ==================== PRODUCT MASTER VIEW ====================
function renderProductMasterList() {
    const tbody = document.getElementById("product-list-tbody");
    tbody.innerHTML = "";

    state.products.forEach(p => {
        const tr = document.createElement("tr");
        const limitText = p.maxAmt > 99999999 ? `₹${p.minAmt.toLocaleString("en-IN")} & Above` : `₹${p.minAmt.toLocaleString("en-IN")} to ₹${p.maxAmt.toLocaleString("en-IN")}`;
        
        tr.innerHTML = `
            <td><strong>${p.code}</strong></td>
            <td><small>${limitText}</small></td>
            <td class="bold-text">${p.rate.toFixed(2)}%</td>
            <td><small>${p.desc}</small></td>
            <td>
                <div class="action-group">
                    <button class="btn-icon btn-icon-green" onclick="editProduct('${p.id}')">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteProduct('${p.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const form = document.getElementById("product-master-form");
    form.onsubmit = (e) => {
        e.preventDefault();
        if (state.currentSession.code !== "99") {
            alert("Error: Only Head Office can add or modify loan products.");
            return;
        }
        const editId = document.getElementById("edit-product-id").value;
        const code = document.getElementById("prod-code").value.trim();
        const minAmt = parseFloat(document.getElementById("prod-min-amt").value) || 0;
        const maxAmt = parseFloat(document.getElementById("prod-max-amt").value) || 999999999;
        const rate = parseFloat(document.getElementById("prod-interest-rate").value) || 0;
        const desc = document.getElementById("prod-desc").value.trim();

        if (editId) {
            const index = state.products.findIndex(p => p.id === editId);
            if (index !== -1) {
                state.products[index] = { id: editId, code, minAmt, maxAmt, rate, desc };
                alert("Product updated successfully.");
            }
        } else {
            const newProduct = {
                id: "prod_" + Date.now(),
                code, minAmt, maxAmt, rate, desc
            };
            state.products.push(newProduct);
            alert("Product added successfully.");
        }

        saveState();
        form.reset();
        document.getElementById("edit-product-id").value = "";
        document.getElementById("product-save-btn").innerHTML = '<i class="fa-solid fa-save"></i> Save Product';
        document.getElementById("product-cancel-edit-btn").classList.add("hidden");
        renderProductMasterList();
    };

    document.getElementById("product-cancel-edit-btn").onclick = () => {
        form.reset();
        document.getElementById("edit-product-id").value = "";
        document.getElementById("product-save-btn").innerHTML = '<i class="fa-solid fa-save"></i> Save Product';
        document.getElementById("product-cancel-edit-btn").classList.add("hidden");
    };
}

function editProduct(id) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can edit products.");
        return;
    }
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    document.getElementById("edit-product-id").value = product.id;
    document.getElementById("prod-code").value = product.code;
    document.getElementById("prod-min-amt").value = product.minAmt;
    document.getElementById("prod-max-amt").value = product.maxAmt;
    document.getElementById("prod-interest-rate").value = product.rate;
    document.getElementById("prod-desc").value = product.desc;

    document.getElementById("product-save-btn").innerHTML = '<i class="fa-solid fa-check"></i> Update Product';
    document.getElementById("product-cancel-edit-btn").classList.remove("hidden");
}

function deleteProduct(id) {
    if (state.currentSession.code !== "99") {
        alert("Error: Only Head Office can delete products.");
        return;
    }
    if (confirm("Permanently delete this product scheme?")) {
        state.products = state.products.filter(p => p.id !== id);
        saveState();
        renderProductMasterList();
    }
}

// ==================== SETTINGS CONFIGURATION ====================
function renderSettings() {
    const isHO = (state.currentSession.code === "99");
    const branchSelectGroup = document.getElementById("settings-branch-select-group");
    const branchSelect = document.getElementById("settings-branch-select");

    let targetBranchCode = state.currentSession.code;

    if (isHO) {
        branchSelectGroup.classList.remove("hidden");
        const prevSelected = branchSelect.value;
        
        branchSelect.innerHTML = "";
        state.branches.forEach(b => {
            const opt = document.createElement("option");
            opt.value = b.code;
            opt.textContent = b.code === "99" ? b.name : `${b.code} ${b.name}`;
            branchSelect.appendChild(opt);
        });

        if (prevSelected && state.branches.some(b => b.code === prevSelected)) {
            branchSelect.value = prevSelected;
        }

        targetBranchCode = branchSelect.value;

        branchSelect.onchange = () => {
            renderSettingsForBranch(branchSelect.value);
        };
    } else {
        branchSelectGroup.classList.add("hidden");
    }

    renderSettingsForBranch(targetBranchCode);

    document.getElementById("reset-system-data-btn").onclick = () => {
        const confirm1 = confirm("Warning: Are you sure you want to restore the system? This will clear all transactions, registers, and custom valuers!");
        if (confirm1) {
            const confirm2 = confirm("Final confirmation: This is a permanent delete. Proceed?");
            if (confirm2) {
                localStorage.removeItem("jccb_gold_loan_state");
                alert("Data cleared. Portal will reload.");
                location.reload();
            }
        }
    };
}

function renderSettingsForBranch(branchCode) {
    const seedsContainer = document.getElementById("account-seeds-container");
    seedsContainer.innerHTML = "";

    const uniqueSchemes = [...new Set(state.products.map(p => p.code))];
    
    if (!state.accountSeeds[branchCode]) {
        state.accountSeeds[branchCode] = { ...DEFAULT_ACCOUNT_SEEDS };
    }
    if (state.lastPacketSeed[branchCode] === undefined) {
        state.lastPacketSeed[branchCode] = 100;
    }

    uniqueSchemes.forEach(code => {
        const currentSeed = state.accountSeeds[branchCode][code] || DEFAULT_ACCOUNT_SEEDS[code] || 1001;

        const group = document.createElement("div");
        group.className = "form-group";
        group.innerHTML = `
            <label for="seed-ac-${code}">Scheme: ${code} - Starting Account Serial</label>
            <input type="number" id="seed-ac-${code}" value="${currentSeed}" required min="1">
            <small class="helper-text">Serials will start from this number (e.g. ${currentSeed})</small>
        `;
        seedsContainer.appendChild(group);
    });

    document.getElementById("seed-last-packet-no").value = state.lastPacketSeed[branchCode];

    document.getElementById("settings-accounts-form").onsubmit = (e) => {
        e.preventDefault();
        
        uniqueSchemes.forEach(code => {
            const inputVal = parseInt(document.getElementById(`seed-ac-${code}`).value);
            if (!isNaN(inputVal) && inputVal > 0) {
                state.accountSeeds[branchCode][code] = inputVal;
            }
        });

        saveState();
        alert(`Account sequence seeds for branch ${branchCode} saved.`);
        renderSettings();
    };

    document.getElementById("settings-general-form").onsubmit = (e) => {
        e.preventDefault();
        const pSeed = parseInt(document.getElementById("seed-last-packet-no").value);
        if (!isNaN(pSeed) && pSeed >= 0) {
            state.lastPacketSeed[branchCode] = pSeed;
            saveState();
            alert(`Packet serial seed for branch ${branchCode} saved.`);
            renderSettings();
        }
    };
}

// ==================== PRINT RECEIPT ENGINE ====================
function printVoucher(loanId, format) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) {
        alert("Error: Loan record not found.");
        return;
    }

    const valuer = state.valuers.find(v => v.id === loan.valuerId) || { name: loan.valuerId, savingsAc: "-", mobile: "-" };
    const printArea = document.getElementById("print-area");
    printArea.innerHTML = "";

    // Single Voucher (A4 Copy)
    if (format === "single") {
        printArea.innerHTML = `
            <div class="print-voucher print-a4-single">
                <div>
                    <div class="voucher-print-header">
                        <div style="display:flex; align-items:center;">
                            <img src="${LOGO_SRC}" alt="JCCB Logo" class="print-bank-logo" style="width:40px; height:40px;">
                            <div class="bank-info">
                                <h2 class="bank-title">The Junagadh Commercial Co-operative Bank Ltd.</h2>
                                <p class="bank-subtitle">Branch: ${loan.branchCode} - ${loan.branchName}</p>
                            </div>
                        </div>
                        <div class="voucher-badge">Gold Loan Sanction Slip</div>
                    </div>

                    <div class="print-meta-grid">
                        <div class="meta-item"><span class="m-label">Account Number</span><span class="m-val">${loan.accountNo}</span></div>
                        <div class="meta-item"><span class="m-label">Packet Number</span><span class="m-val">#${loan.packetNo}</span></div>
                        <div class="meta-item"><span class="m-label">Sanction Date</span><span class="m-val">${formatDateDMY(loan.date)}</span></div>
                        <div class="meta-item"><span class="m-label">Loan Type</span><span class="m-val">${loan.loanStatus}</span></div>
                        <div class="meta-item" style="grid-column: span 2;"><span class="m-label">Borrower Name</span><span class="m-val">${loan.borrowerName}</span></div>
                        <div class="meta-item"><span class="m-label">Member Status</span><span class="m-val">${loan.isMember} (No: ${loan.memberNo})</span></div>
                        <div class="meta-item"><span class="m-label">Scheme Code</span><span class="m-val">${loan.productCode}</span></div>
                    </div>

                    <div class="print-details-split">
                        <div class="print-panel-card">
                            <h4>Gold Evaluation & Valuation</h4>
                            <div class="p-row"><span>Ornaments Weight:</span><span class="p-val">${parseFloat(loan.goldWeight).toFixed(3)} Grams</span></div>
                            <div class="p-row"><span>Gold Market Rate (/10g):</span><span class="p-val">₹${parseFloat(loan.marketRate).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Ornaments Market Value:</span><span class="p-val">₹${parseFloat(loan.marketValue).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Max Eligible Loan (75%):</span><span class="p-val">₹${parseFloat(loan.eligibleAmount).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Ornaments Description:</span><span class="p-val" style="font-size:8px;">${loan.ornamentsDesc}</span></div>
                            <div class="p-row"><span>Authorized Soni Valuer:</span><span class="p-val" style="font-size:8px;">${valuer.name}</span></div>
                        </div>

                        <div class="print-panel-card">
                            <h4>Loan Parameters</h4>
                            <div class="p-row"><span>Sanctioned Amount:</span><span class="p-val" style="font-size:12px;">₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Interest Rate (Fix):</span><span class="p-val">${loan.interestRate}</span></div>
                            <div class="p-row"><span>Valuer Savings A/c No:</span><span class="p-val">${valuer.savingsAc}</span></div>
                            <div class="p-row"><span>Valuer Mobile No:</span><span class="p-val">${valuer.mobile}</span></div>
                        </div>
                    </div>

                    <h4 style="font-size:11px; margin-bottom: 4px;">Deductions & Service Charges Breakdown</h4>
                    <table class="print-charges-table">
                        <thead>
                            <tr>
                                <th>Charge Description</th>
                                <th>Amount (₹)</th>
                                <th>Charge Description</th>
                                <th>Amount (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Share Capital (Group A)</td>
                                <td>₹${parseFloat(loan.shareA).toFixed(2)}</td>
                                <td>Service Charges</td>
                                <td>₹${parseFloat(loan.serviceCharge).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Share Capital (Group B)</td>
                                <td>₹${parseFloat(loan.shareB).toFixed(2)}</td>
                                <td>Document Charges</td>
                                <td>₹${parseFloat(loan.docCharge).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Member Fee</td>
                                <td>₹${parseFloat(loan.memberFee).toFixed(2)}</td>
                                <td>Insurance Charges</td>
                                <td>₹${parseFloat(loan.insCharge).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Valuation Fee</td>
                                <td>₹${parseFloat(loan.valuationCharge).toFixed(2)}</td>
                                <td>CGST (9%)</td>
                                <td>₹${parseFloat(loan.cgst).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Stamp Duty</td>
                                <td>₹${parseFloat(loan.stampCharge).toFixed(2)}</td>
                                <td>SGST (9%)</td>
                                <td>₹${parseFloat(loan.sgst).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Manual Adjustment</td>
                                <td>₹${parseFloat(loan.adjustment).toFixed(2)}</td>
                                <td><strong>Total Deductions</strong></td>
                                <td><strong>₹${parseFloat(loan.totalCharges).toFixed(2)}</strong></td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="print-net-banner">
                        <span>Net Loan Disbursal Amount (Net Payable):</span>
                        <span class="disbursal-num">₹${parseFloat(loan.netDisbursal).toLocaleString("en-IN")}.00</span>
                    </div>

                    <div style="font-size: 8px; line-height: 1.4; border: 1px solid #ddd; padding: 6px; margin-top: 10px;">
                        <strong>Declaration:</strong> I/We declare that the gold ornaments pledged in the bank have been inspected and sealed in my presence. If I fail to repay the principal with interest inside the loan tenure, the bank reserves full rights to auction the pledged assets to recover outstanding debts.
                    </div>
                </div>

                <div class="print-signatures-row">
                    <div class="sig-block">Borrower Signature</div>
                    <div class="sig-block">Valuer Soni Signature</div>
                    <div class="sig-block">Cashier Signature</div>
                    <div class="sig-block">Loan Clerk</div>
                    <div class="sig-block">Branch Manager</div>
                </div>
            </div>
        `;
    }

    // 3-in-1 Voucher Template (A4 split)
    if (format === "three-in-one") {
        const segments = [
            { title: "Bank Copy", subtitle: "For Ledger Records" },
            { title: "Borrower Copy", subtitle: "To be given to customer" },
            { title: "Vault Packet Copy", subtitle: "To be kept inside sealed packet in vault" }
        ];

        let html = `<div class="print-voucher print-a4-three">`;
        
        segments.forEach((seg, idx) => {
            html += `
                <div class="three-part-segment">
                    <div class="voucher-print-header">
                        <div style="display:flex; align-items:center;">
                            <img src="${LOGO_SRC}" alt="JCCB Logo" class="print-bank-logo">
                            <div class="bank-info">
                                <h2 class="bank-title" style="font-size: 11px;">The Junagadh Commercial Co-operative Bank Ltd.</h2>
                                <p class="bank-subtitle" style="font-size: 8px;">Branch: ${loan.branchCode} - ${loan.branchName}</p>
                            </div>
                        </div>
                        <div class="voucher-badge" style="font-size: 8px; padding: 2px 6px;">${seg.title}</div>
                    </div>

                    <div class="print-meta-grid-three">
                        <div><strong>Account No:</strong> ${loan.accountNo}</div>
                        <div><strong>Packet No:</strong> #${loan.packetNo}</div>
                        <div><strong>Sanction Date:</strong> ${formatDateDMY(loan.date)}</div>
                        <div><strong>Name:</strong> ${loan.borrowerName}</div>
                        <div><strong>Member ID:</strong> ${loan.memberNo}</div>
                        <div><strong>Scheme:</strong> ${loan.productCode}</div>
                    </div>

                    <div class="print-details-split-three">
                        <div class="print-panel-card" style="padding: 4px 6px;">
                            <h4 style="font-size: 8px; margin-bottom: 2px;">Evaluation Details</h4>
                            <div class="p-row"><span>Gold Weight:</span><span class="p-val">${parseFloat(loan.goldWeight).toFixed(3)}g</span></div>
                            <div class="p-row"><span>Market Rate:</span><span class="p-val">₹${parseFloat(loan.marketRate)}</span></div>
                            <div class="p-row"><span>Market Value:</span><span class="p-val">₹${parseFloat(loan.marketValue)}</span></div>
                            <div class="p-row"><span>Inspector:</span><span class="p-val" style="font-size:7px;">${valuer.name.substring(0, 18)}</span></div>
                        </div>

                        <div class="print-panel-card" style="padding: 4px 6px;">
                            <h4 style="font-size: 8px; margin-bottom: 2px;">Financial Summary & Charges</h4>
                            <div class="p-row"><span>Sanctioned Amount:</span><span class="p-val">₹${parseFloat(loan.loanAmount).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Total Deductions:</span><span class="p-val">₹${parseFloat(loan.totalCharges).toLocaleString("en-IN")}</span></div>
                            <div class="p-row"><span>Interest Rate:</span><span class="p-val">${loan.interestRate}</span></div>
                            <div class="p-row"><span>Particulars:</span><span class="p-val" style="font-size:7.5px;">${loan.ornamentsDesc.substring(0, 28)}</span></div>
                        </div>
                    </div>

                    <div class="print-net-banner-three">
                        <span>Net Loan Disbursed (Net Paid):</span>
                        <span class="disbursal-num">₹${parseFloat(loan.netDisbursal).toLocaleString("en-IN")}.00</span>
                    </div>

                    <div class="print-signatures-row-three">
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Borrower Signature</div>
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Valuer Signature</div>
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Cashier Signature</div>
                        <div class="sig-block" style="font-size:7px; border-top: 0.5px solid black; width: 22%;">Manager Signature</div>
                    </div>

                    ${idx < 2 ? `<div class="tear-line-indicator"><i class="fa-solid fa-scissors"></i> Tear along line ----------------------------------------------------------------------</div>` : ''}
                </div>
            `;
        });
        html += "</div>";
        printArea.innerHTML = html;
    }

    // Gujarati Loan Requisition Form Print
    if (format === "application_form") {
        const gujWords = numberToGujaratiWords(loan.loanAmount);
        const ltv = loan.marketValue > 0 ? Math.round((loan.loanAmount / loan.marketValue) * 100) : 0;
        const gujNums = ['૧', '૨', '૩', '૪', '૫', '૬', '૭'];
        const is3553 = (loan.productCode === "GOD-3553" || loan.productCode === "3553");
        
        printArea.innerHTML = `
            <div class="print-voucher print-requisition-form" style="width:100%; box-sizing:border-box; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif; color:#000000; background-color:#ffffff;">
                
                <!-- PAGE 1: REQUISITION FORM -->
                <div class="print-page-break print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                    <!-- Bank Letterhead (Logo on Left, Name & Address next to it) -->
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                        <img src="${LOGO_SRC}" alt="JCCB Logo" style="width: 55px; height: 55px; object-fit: contain; border-radius: 50%; border: 1.5px solid #000000;">
                        <div style="text-align: left;">
                            <h1 style="font-size: 20px; font-weight: 800; margin: 0; font-family: 'Outfit', 'Noto Sans Gujarati', sans-serif;">ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ.</h1>
                            <p style="font-size: 14.5px; margin: 2px 0 0 0; font-weight: 700;">હે.ઓ. : "ચંદ્રકાંત માલવિયા સ્મૃતિ ભવન", ચોકસી બજાર, જૂનાગઢ. ૩૬૨૦૦૧</p>
                        </div>
                    </div>
                    <!-- Centered Document Title -->
                    <div style="text-align: center; margin-bottom: 8px;">
                        <p style="font-size: 15px; font-weight: 800; margin: 4px 0 0 0; text-decoration: underline;">સોનાનાં દાગીનાની જામીનગીરી પર કરજ માંગણીની અરજી</p>
                    </div>
 
                    <!-- Requisition Letter Body in Exact Paragraph Format (with Floated photo) -->
                    <div style="font-size:13.5px; line-height:1.4; text-align:justify; margin-top:5px; min-height:110px;">
                        <div style="border: 2px solid #000000; width: 90px; height: 105px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; float: right; margin-left: 15px; margin-bottom: 5px;">
                            ${loan.custPhoto ? `<img src="${loan.custPhoto}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:9px; text-align:center; padding:5px; color:#555;">ગ્રાહકનો ફોટો</span>`}
                        </div>
                        <p style="margin:0 0 4px 0; font-weight:700;">પ્રતિ,<br>મેનેજરશ્રી,<br>ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ. <br>${loan.branchName} શાખા.</p>
                        <p style="margin:0 0 4px 0; font-weight:700;">સાહેબશ્રી,</p>
                        
                        <p style="text-indent:20px; margin:0 0 5px 0;">
                            "સવિનય હું <strong>${loan.borrowerName}</strong> સરનામું <strong>${loan.custAddress || "-"}</strong>, ઉ.વ. <strong>${loan.custAge || "-"}</strong>, ધંધો <strong>${loan.custOccupation || "-"}</strong>, મોબાઇલ નંબર <strong>${loan.custMobile || "-"}</strong>, મેમ્બરશીપ નંબર <strong>${loan.memberNo || "-"}</strong>"
                        </p>
                        
                        <p style="text-indent:20px; margin:0 0 5px 0;">
                            "આ સાથે સામેલ વેલ્યુએશન રિપોર્ટ મુજબના મારી માલિકીના સોનાનાં દાગીનાની જામીનગીરી ઉપર રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong>, નું આપની બેંકમાંથી ધિરાણ <strong>${loan.loanPurpose || "-"}</strong>, ના હેતુ માટે મેળવવા માટે અરજી કરું છું. આથી હું તમો બેંકને ખાતરી અને બાંહેધરી આપું છું કે બેંકને જામીનગીરીમાં આપેલ દાગીના મારી સ્વતંત્ર માલિકીના છે. મેં બેંકના સોનાના દાગીનાની જામીનગીરી પર ધિરાણના નિયમો વાંચ્યા છે જે મને કબુલ-મંજુર છે. વધુમાં હું કબુલ રાખું છું કે રિઝર્વ બેંક ઓફ ઇન્ડિયાની વખતો વખતની સૂચના પ્રમાણે બેંક વ્યાજ મારા ખાતામાં ઉધરશે જે મને મંજુર છે. બેંકને નિયમાનુસાર દસ્તાવેજો લખી આપવા હું તૈયાર છું."
                        </p>
                        
                        <p style="text-indent:20px; margin:0 0 5px 0;">
                            "આજરોજ બેંક દ્વારા મંજુર કરાયેલ રકમ રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong>, અંકે રૂપિયા <strong>${gujWords}</strong>, ના ધિરાણની સલામતી પેટે હું આ સાથે સામેલ વેલ્યુએશન રિપોર્ટમાં દર્શાવ્યા મુજબના મારી માલિકીના સોનાના દાગીના થાલમાં આપી બેંકને સોંપુ છું."
                        </p>
                        
                        <p style="text-indent:20px; margin:0 0 5px 0;">
                            "વેલ્યુએશન રિપોર્ટમાં દર્શાવેલા તમામ સોનાના દાગીનાઓ શરાફે મારી હાજરીમાં એક સીલબંધ પેકેટ બનાવી, એક કાગળનું લેબલ બનાવી મારી હાજરીમાં બેંકના અધિકારીની સહી કરાવી દાગીનાના પેકેટ ઉપર ઉપર ચોટાડી તૈયાર થયેલ સદર સીલબંધ પેકેટમાં રાખેલ સોનાના દાગીના હું બેંકને થાલમાં આપું છું."
                        </p>
                        
                        <p style="text-indent:20px; margin:0 0 6px 0;">
                            "ઉપરાંત આ દાગીનાના વારસદાર તરીકે હું <strong>${loan.custNomineeName || "-"}</strong> સંબંધે <strong>${loan.custNomineeRelation || "-"}</strong> ની નિમણુંક કરું છું."
                        </p>
                    </div>
 
                    <!-- Location, Date (Left) and Borrower Signature (Right) -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:15px; font-size:13.5px;">
                        <div style="text-align:left; font-weight:700; line-height:1.4;">
                            <div>સ્થળઃ- ${loan.branchName}</div>
                            <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="height:50px;"></div> <!-- Signature space -->
                            <div style="margin-bottom:3px;">X ------------------------------------------</div>
                            <div style="font-weight:700; padding-right:45px;">(${loan.borrowerName})</div>
                        </div>
                    </div>
 
                    <!-- Office Verification Block (ઓફિસ શેરો) -->
                    <div style="margin-top:10px; padding-top:6px;">
                        <div style="display:flex; align-items:center; text-align:center; margin-bottom:8px; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                            <div style="flex:1; border-bottom:1.5px solid #000000; margin-right:15px;"></div>
                            <span style="font-weight:800; font-size:14px; white-space:nowrap; letter-spacing:1px; color:#000000;">ઓફિસ શેરો</span>
                            <div style="flex:1; border-bottom:1.5px solid #000000; margin-left:15px;"></div>
                        </div>
                        
                        <table style="width:100%; border-collapse:collapse; margin-bottom:6px; font-size:13px; border:1.5px solid #000000;">
                            <tr style="border-bottom:1.5px solid #000000;">
                                <td style="padding:3px 6px; font-weight:700; border-right:1.5px solid #000000; width:45%;">ખાતા નંબર (ખાતા નો પ્રકાર અને ખાતા નંબર લેવા):</td>
                                <td style="padding:3px 6px; font-weight:700;">${loan.accountNo || "-"}</td>
                            </tr>
                            <tr style="border-bottom:1.5px solid #000000;">
                                <td style="padding:3px 6px; font-weight:700; border-right:1.5px solid #000000;">પેકેટ નંબરઃ-</td>
                                <td style="padding:3px 6px; font-weight:700;">#${loan.packetNo || "-"}</td>
                            </tr>
                            <tr>
                                <td style="padding:3px 6px; font-weight:700; border-right:1.5px solid #000000;">સેવિંગ ખાતા નંબરઃ-</td>
                                <td style="padding:3px 6px; font-weight:700;">${loan.custSavingsAc || "-"}</td>
                            </tr>
                        </table>
 
                        <p style="text-indent:20px; font-size:13.5px; line-height:1.4; text-align:justify; margin:6px 0;">
                            "વેલ્યુએશન રિપોર્ટમાં દર્શાવ્યા મુજબના સોનાનાં દાગીના થાલમાં લઈને તેનીકુલ કિંમત રૂ. <strong>${parseFloat(loan.marketValue).toLocaleString("en-IN")}/-</strong> ના <strong>${ltv}%</strong> લેખે ધિરાણની રકમ રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> અંકે રકમ રૂ. <strong>${gujWords}</strong> નો બેંકના સોનાના દાગીના સામે ધિરાણના નિયમાનુસાર ચુકાદો કરવાની મંજુરી આપવામાં આવે છે. આજરોજ ઉપરોક્ત દાગીનાનું સીલબંધ પેકેટ અરજદાર પાસેથી સંભાળી લૉકરમાં મુકેલ છે."
                        </p>
 
                        <div style="font-weight:700; font-size:13.5px; margin-top:4px; margin-bottom:10px;">
                            તારીખઃ- ${formatDateDMY(loan.date)}
                        </div>
 
                        <!-- Sign-off blocks for Clerks & Managers -->
                        <div style="display:flex; justify-content:space-between; margin-top:15px; font-size:13.5px; font-weight:700;">
                            <div style="width:40%; text-align:center;">
                                <div style="height:50px;"></div> <!-- Signature space -->
                                સહી: X..........................................................................<br>
                                <span style="font-size:12px; font-weight:600;">(લોન ક્લાર્ક)</span>
                            </div>
                            <div style="width:40%; text-align:center;">
                                <div style="height:50px;"></div> <!-- Signature space -->
                                સહી: X..........................................................................<br>
                                <span style="font-size:12px; font-weight:600;">(શાખા પ્રબંધક)</span>
                            </div>
                        </div>
                    </div>
                </div>
 


                <!-- PAGE 2: VALUATION REPORT & PROMISSORY NOTE -->
                <div class="print-page-break print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                    <!-- Bank Letterhead (Logo on Left, Name & Address next to it) -->
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                        <img src="${LOGO_SRC}" alt="JCCB Logo" style="width: 55px; height: 55px; object-fit: contain; border-radius: 50%; border: 1.5px solid #000000;">
                        <div style="text-align: left;">
                            <h1 style="font-size: 20px; font-weight: 800; margin: 0; font-family: 'Outfit', 'Noto Sans Gujarati', sans-serif;">ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ.</h1>
                            <p style="font-size: 14.5px; margin: 2px 0 0 0; font-weight: 700;">હે.ઓ. : "ચંદ્રકાંત માલવિયા સ્મૃતિ ભવન", ચોકસી બજાર, જૂનાગઢ. ૩૬૨૦૦૧</p>
                        </div>
                    </div>

                    <!-- Header Address (with floated Gold Ornament photo) -->
                    <div style="font-size:13.5px; line-height:1.4; text-align:justify; margin-top:5px; min-height:110px;">
                        <div style="border: 2px solid #000000; width: 90px; height: 95px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; float: right; margin-left: 15px; margin-bottom: 5px;">
                            ${loan.goldPhoto ? `<img src="${loan.goldPhoto}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:9px; text-align:center; padding:5px; color:#555;">દાગીનાનો ફોટો</span>`}
                        </div>
                        <p style="margin:0 0 4px 0; font-weight:700;">પ્રતિ,<br>મેનેજરશ્રી,<br>ધી જૂનાગઢ કોમર્શીયલ કો-ઓપરેટીવ બેંક લી. <br>${loan.branchName} શાખા.</p>
                        <p style="margin:0 0 4px 0; font-weight:700;">સાહેબશ્રી,</p>
                        <p style="margin:0 0 6px 0;">
                            હું <strong>${loan.borrowerName}</strong>, રહેવાસીઃ- <strong>${loan.custAddress || "-"}</strong>,
                        </p>
                    </div>

                    <!-- Market Rate Display (Centered, Large) -->
                    <div style="text-align:center; font-weight:800; font-size:14.5px; margin: 4px 0; color:#000000; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                        આજનો બજાર ભાવ રૂ. <strong>${parseFloat(loan.marketRate).toLocaleString("en-IN")}/-</strong> 10 ગ્રામ શુધ્ધ સોનાનો ભાવ
                    </div>
 
                    <!-- Valuation Report Header (Centered, Large) -->
                    <div style="text-align:center; font-weight:800; font-size:14.5px; margin: 4px 0; text-decoration:underline; color:#000000; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                        સોનાનાં દાગીનાનો વેલ્યુએશન રિપોર્ટ
                    </div>
 
                    <!-- Ornaments Table (10 Blank Rows + Total Row) -->
                    <table style="width:100%; border-collapse:collapse; margin:4px 0; font-size:11.5px; border:1.5px solid #000000; text-align:center; color:#000000;">
                        <thead>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:20px;">
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:5%;" rowspan="2">ક્રમ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:27%;" rowspan="2">દાગીનાની વિગત</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:8%;" rowspan="2">નંગ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">ગ્રોસ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">નેટ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:12%;" rowspan="2">શુદ્ધતા કેરેટમાં</th>
                                <th style="padding:3px; font-weight:800; width:12%;" rowspan="2">કિંમત રૂ.</th>
                            </tr>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:18px;">
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${gujNums.map((num) => `
                            <tr style="border-bottom:1.5px solid #000000; height:29px;">
                                <td style="border-right:1.5px solid #000000; padding:2px; font-weight:700;">${num}</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                            `).join('')}
                            <tr style="font-weight:800; background-color:#f5f5f5; height:28px;">
                                <td style="border-right:1.5px solid #000000; padding:2px;" colspan="3">કુલ (Total)</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                        </tbody>
                    </table>
 
                    <div style="text-align:right; font-size:13.5px; margin-top:4px; margin-bottom:4px;">
                        <div style="height:40px;"></div> <!-- Signature space -->
                        <div style="margin-bottom:3px;">વેલ્યુઅરની સહી: X........................................</div>
                        <div style="font-weight:700; padding-right:60px;">(${valuer.name})</div>
                    </div>
 
                    <!-- Borrower Acceptance of Valuation -->
                    <p style="font-size:13.5px; line-height:1.45; text-align:justify; margin:6px 0 4px 0;">
                        "ઉપરોક્ત વિગતે વેલ્યુઅરે જે શુદ્ધતા, વજન, દર, કિંમત આકારેલ છે તે વાજબી છે અને મને કબૂલ-મંજુર છે."
                    </p>
 
                    <div style="text-align:right; font-size:13.5px; margin-top:4px; margin-bottom:4px;">
                        <div style="height:40px;"></div> <!-- Signature space -->
                        <div style="margin-bottom:3px;">અરજદારની સહી: X........................................</div>
                        <div style="font-weight:700; padding-right:60px;">(${loan.borrowerName})</div>
                    </div>
 
                    <!-- Page-width Dotted Separator -->
                    <div style="border-top: 1.5px dashed #000000; margin: 4px 0; width:100%;"></div>
 
                    <!-- Demand Promissory Note Header (Centered, Large) -->
                    <div style="text-align:center; font-weight:800; font-size:15px; margin: 4px 0; text-decoration:underline; color:#000000; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">
                        ડિમાન્ડ પ્રોમિસરી નોટ – વચન ચિઠ્ઠી
                    </div>
 
                    <!-- Promissory Note Text -->
                    <p style="text-indent:20px; font-size:13.5px; line-height:1.45; text-align:justify; margin-bottom:6px;">
                        "હું <strong>${loan.borrowerName}</strong>, આજરોજ મને મળેલા અવેજ બદલ રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong>, અંકે રૂપિયા <strong>${gujWords}</strong>, <strong>${loan.interestRate}</strong>, માસિક ચક્રવૃદ્ધિ વ્યાજ ગણતરી અનુસાર વાર્ષિક વ્યાજ દરે ચડત વ્યાજની રકમ સહીત જયારે માંગો ત્યારે ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ. <strong>${loan.branchName}</strong> જુનાગઢ અથવા તેનાં આદેશ અનુસાર તેની કોઈપણ શાખામાં ચૂકવી આપવાનું વચન આપું છું."
                    </p>
 
                    <!-- Location and Date -->
                    <div style="text-align:left; font-weight:700; line-height:1.4; font-size:13.5px; margin-top:2px; margin-bottom:2px;">
                        <div>સ્થળઃ- ${loan.branchName}</div>
                        <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                    </div>
 
                    <!-- Double Signatures for borrower at the bottom (Revenue stamp on right) -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:4px; font-size:13.5px; font-weight:700;">
                        <div style="width:45%; text-align:center; padding-bottom:5px;">
                            <div style="height:45px;"></div> <!-- Signature space -->
                            સહી: X....................................................<br>
                            <span style="font-size:12px; font-weight:600;">(${loan.borrowerName})</span>
                        </div>
                        <div style="width:45%; text-align:center; display:flex; flex-direction:column; align-items:center;">
                            <div style="border: 1.5px dashed #000000; width: 60px; height: 75px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; text-align:center; font-size:9.5px; font-weight:700; padding:4px; margin-bottom:4px;">
                                રેવન્યુ સ્ટેમ્પ
                            </div>
                            <div style="width:100%;">
                                સહી: X....................................................<br>
                                <span style="font-size:12px; font-weight:600;">(${loan.borrowerName})</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- PAGE 3: RECEIPT & RETURN ACKNOWLEDGMENT -->
                <div class="${(!is3553 && parseFloat(loan.loanAmount) <= 50000) ? 'print-page-break ' : ''}print-page-layout" style="padding: 5px 0; box-sizing:border-box;">
                    <!-- Bank Header (Centered, Large Font) -->
                    <div style="text-align: center; margin-bottom: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 8px;">
                        <h1 style="font-size: 20px; font-weight: 800; margin: 0; font-family: 'Outfit', 'Noto Sans Gujarati', sans-serif;">ધી જૂનાગઢ કોમર્શિયલ કો-ઓપરેટીવ બેંક લિ.</h1>
                        <p style="font-size: 14.5px; margin: 2px 0 0 0; font-weight: 700;">હે.ઓ. : “ચંદ્રકાંત માલવિયા સ્મૃતિ ભવન”, ચોકસી બજાર, જૂનાગઢ. ૩૬૨૦૦૧</p>
                    </div>

                    <!-- Recipient & Floating Photos -->
                    <div style="font-size: 13px; line-height: 1.4; text-align: left; margin-top: 5px; min-height: 100px;">
                        <!-- Side-by-side Photo Boxes on the Right -->
                        <div style="float: right; display: flex; gap: 10px; margin-left: 15px; margin-bottom: 5px;">
                            <div style="border: 2px solid #000000; width: 85px; height: 95px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; text-align: center;">
                                ${loan.custPhoto ? `<img src="${loan.custPhoto}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:8px; padding:3px; color:#555;">ગ્રાહકનો ફોટો</span>`}
                            </div>
                            <div style="border: 2px solid #000000; width: 85px; height: 95px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: hidden; text-align: center;">
                                ${loan.goldPhoto ? `<img src="${loan.goldPhoto}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:8px; padding:3px; color:#555;">દાગીનાનો ફોટો</span>`}
                            </div>
                        </div>
                        
                        <p style="margin: 0 0 4px 0; font-weight: 700;">પ્રતિ,<br>મેનેજરશ્રી,<br>ધી જૂનાગઢ કોમર્શીયલ કો-ઓપરેટીવ બેંક લી.<br>${loan.branchName} શાખા.</p>
                        <p style="margin: 0; font-weight: 700;">સાહેબશ્રી,</p>
                    </div>

                    <!-- Salutation Details -->
                    <div style="font-size:13px; line-height:1.45; text-align:justify; margin-top:3px;">
                        <p style="margin:0 0 3px 0;">
                            હું <strong>${loan.borrowerName}</strong> રહે. <strong>${loan.custAddress || "-"}</strong>
                        </p>
                        <p style="margin:0 0 3px 0;">
                            આજનો બજાર ભાવ રૂ. <strong>${parseFloat(loan.marketRate).toLocaleString("en-IN")}/-</strong> ૧૦ ગ્રામ શુદ્ધ સોનાનો
                        </p>
                    </div>

                    <!-- Centered Title -->
                    <div style="text-align: center; margin: 4px 0;">
                        <span style="font-weight: 800; font-size: 15px; text-decoration: underline; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">ગ્રાહકને આપવાની પહોંચ</span>
                    </div>

                    <!-- Ornaments Table (7 rows of height 33px) -->
                    <table style="width:100%; border-collapse:collapse; margin:4px 0; font-size:11.5px; border:1.5px solid #000000; text-align:center; color:#000000;">
                        <thead>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:20px;">
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:5%;" rowspan="2">ક્રમ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:27%;" rowspan="2">દાગીનાની વિગત</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:8%;" rowspan="2">નંગ</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">ગ્રોસ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:18%;" colspan="2">નેટ વજન</th>
                                <th style="border-right:1.5px solid #000000; padding:3px; font-weight:800; width:12%;" rowspan="2">શુદ્ધતા કેરેટમાં</th>
                                <th style="padding:3px; font-weight:800; width:12%;" rowspan="2">કિંમત રૂ.</th>
                            </tr>
                            <tr style="border-bottom:1.5px solid #000000; background-color:#f5f5f5; font-weight:700; height:18px;">
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">ગ્રામ</th>
                                <th style="border-right:1.5px solid #000000; padding:2px; font-weight:800; font-size:10px;">મી.ગ્રા.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${gujNums.map((num) => `
                            <tr style="border-bottom:1.5px solid #000000; height:33px;">
                                <td style="border-right:1.5px solid #000000; padding:2px; font-weight:700;">${num}</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                            `).join('')}
                            <tr style="font-weight:800; background-color:#f5f5f5; height:28px;">
                                <td style="border-right:1.5px solid #000000; padding:2px;" colspan="3">કુલ (Total)</td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="border-right:1.5px solid #000000; padding:2px;"></td>
                                <td style="padding:2px;"></td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Duration Details -->
                    <p style="margin: 4px 0; font-size: 13px; line-height: 1.4;">
                        સદરહુ ધિરાણ રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> ની મુદત તા. <strong>${formatDateDMY(loan.date)}</strong> થી ૧ વર્ષ સુધીની છે.
                    </p>

                    <!-- Location & Date on the Left / Signature placeholder on the Right -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 5px; font-size: 13px; font-weight: 700; line-height: 1.4;">
                        <div>
                            <div>સ્થળઃ- ${loan.branchName}</div>
                            <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align: right; width: 45%;">
                        </div>
                    </div>

                    <!-- Three Signatures -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12px; font-size: 12.5px; font-weight: 700; text-align: center; line-height: 1.3;">
                        <div style="width: 32%;">
                            <div>X............................................................</div>
                            <div style="margin-top: 3px;">${valuer.name}</div>
                            <div style="font-size: 10.5px; font-weight: 600; color: #444; margin-top:2px;">${valuer.name}<br>(સીલબંધ પેકેટ તૈયાર કરનાર)</div>
                        </div>
                        <div style="width: 32%;">
                            <div>X............................................................</div>
                            <div style="margin-top: 3px;">${loan.borrowerName}</div>
                            <div style="font-size: 10.5px; font-weight: 600; color: #444; margin-top:2px;">દાગીના સોંપનારની સહી<br>(${loan.borrowerName})</div>
                        </div>
                        <div style="width: 32%;">
                            <div>X............................................................</div>
                            <div style="height: 15px;"></div>
                            <div style="font-size: 10.5px; font-weight: 600; color: #444; margin-top:2px;">ઓફિસરની સહી<br>(બેંક વતી દાગીના સંભાળનાર)</div>
                        </div>
                    </div>

                    <!-- Dotted Separator -->
                    <div style="border-top: 1.5px dashed #000000; margin: 8px 0; width: 100%;"></div>

                    <!-- Return Acknowledgment Title -->
                    <div style="text-align: center; margin: 4px 0;">
                        <span style="font-weight: 800; font-size: 15px; text-decoration: underline; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">દાગીના પરત મળ્યાંની પહોંચ</span>
                    </div>

                    <div style="font-size: 13px; line-height: 1.4; text-align: left; margin-bottom: 5px; font-weight: 700;">
                        પ્રતિ,<br>મેનેજરશ્રી, ધી જૂનાગઢ કોમ. કો-ઓપ. બેંક લિ. <br>${loan.branchName} શાખા.
                    </div>

                    <p style="text-indent: 20px; font-size: 13px; line-height: 1.4; text-align: justify; margin: 4px 0;">
                        બેંક તરફથી ઉપર મુજબના દાગીના મને અંકે કરજ પાકતી મુદતે પૂરેપૂરા સોનાના વજન સહીત સીલબંધ પેકેટમાં સહી-સલામત પરત મળેલ છે. હવે મારે બેંક પ્રત્યે દાગીના અંગે કશો વાંધો કે તકરાર રહેતી નથી.
                    </p>

                    <!-- Return Metadata & Signature Row -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top: 10px; font-size: 13px;">
                        <div style="font-weight: 700; line-height: 1.45; text-align: left;">
                            <div>તારીખ:- ${formatDateDMY(loan.date)}</div>
                            <div>લોન ખાતા નં:- ${loan.accountNo || "-"}</div>
                            <div>પેકેટ નંબર:- #${loan.packetNo || "-"}</div>
                        </div>
                        <div style="text-align: center; width: 45%;">
                            <div>X........................................................................</div>
                            <div style="margin-top: 3px; font-weight: 700;">(${loan.borrowerName})</div>
                            <div style="font-size: 11px; font-weight: 600; color: #444; margin-top:2px;">દાગીના પરત મેળવનાર</div>
                        </div>
                    </div>

                    <!-- Rules Box -->
                    <div style="margin-top: 10px; border: 1.5px solid #000000; padding: 6px 10px; font-size: 11px; line-height: 1.35; background-color: #fafafa; color: #000000;">
                        <div style="font-weight: 800; font-size: 11.5px; margin-bottom: 4px; text-decoration: underline; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif;">નિયમોઃ-</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px;">
                            <div><strong>(૧)</strong> આ ધિરાણની મુદત એક વર્ષની છે.</div>
                            <div><strong>(૨)</strong> વ્યાજનો દર બેંકનું બોર્ડ વખતોવખત ઠરાવશે તે લાગુ રહેશે.</div>
                            <div><strong>(૩)</strong> ખાતે ઉધારેલ માસિક વ્યાજ દર માસે જમા કરાવવાનું છે. અન્યથા ૨ % વધારાનું વ્યાજ વસુલવામાં આવશે.</div>
                            <div><strong>(૪)</strong> ધિરાણ લેનારે વારસદાર નીમવા ફરજીયાત છે.</div>
                            <div><strong>(૫)</strong> આ ધિરાણ અંગેના તમામ વ્યવહારો કરતી વખતે આ પહોંચ સાથે રાખવી ફરજીયાત છે.</div>
                            <div><strong>(૬)</strong> ધિરાણ લેનાર વ્યક્તિને જ દાગીના પરત સોંપવામાં આવશે.</div>
                        </div>
                    </div>
                </div>
                                <!-- PAGE 4: LETTER OF PLEDGE (લેટર ઓફ પ્લેજ) -->
                ${(!is3553 && parseFloat(loan.loanAmount) <= 50000) ? `
                <div class="print-page-layout" style="padding: 10px 0; box-sizing:border-box; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif; font-size:14.5px; line-height:1.45; color:#000000; background-color:#ffffff;">
                    <!-- Date on Right -->
                    <div style="text-align: right; font-weight: 700; margin-bottom: 8px;">
                        તારીખઃ- ${formatDateDMY(loan.date)}
                    </div>

                    <!-- Centered Title -->
                    <div style="text-align: center; margin-bottom: 12px;">
                        <h2 style="font-size: 20px; font-weight: 800; margin: 0; text-decoration: underline;">લેટર ઓફ પ્લેજ</h2>
                    </div>

                    <!-- Recipient -->
                    <div style="font-weight: 700; margin-bottom: 10px; line-height: 1.4;">
                        પ્રતિ,<br>
                        મેનેજર સાહેબ,<br>
                        ધી જૂનાગઢ કોમ. કો-ઓપ. બેંક લિ.<br>
                        ${loan.branchName} શાખા.
                    </div>

                    <!-- Opening declaration -->
                    <p style="margin-bottom: 10px; text-align: justify; text-indent: 30px;">
                        હું <strong>${loan.borrowerName}</strong> ધંધોઃ- <strong>${loan.custOccupation || "-"}</strong>, ઉ.વ. <strong>${loan.custAge || "-"}</strong>, ધર્મેઃ- <strong>${loan.custReligion || "-"}</strong>, રહેઃ- <strong>${loan.custAddress || "-"}</strong> નીચે પ્રમાણે લખી બંધાઉં છું કે :-
                    </p>

                    <!-- 10 Points List -->
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧.</span>
                            <span style="text-align: justify;">આજરોજ મારી પોતાની માલિકીના સોનાના દાગીના કે જેની નોંધ બેંક તરફથી મને મળેલ જુદી પહોંચમાં કરેલ છે, તે બેંકને થાલમાં આપી મેં રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> અંકે રૂપિયા <strong>${gujWords}</strong> નું ધિરાણ મેળવેલ છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૨.</span>
                            <span style="text-align: justify;">સદરહુ રકમની આજરોજ મેં જુદી વચન ચિઠ્ઠી લખી છે અને ધિરાણની રકમ પર <strong>${loan.interestRate}</strong> ના વાર્ષિક વ્યાજ દરે, માસિક ચક્રવૃદ્ધિ લેખે ભરપાઈ કરવું છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૩.</span>
                            <span style="text-align: justify;">સદરહુ ધિરાણની રકમ ૧ વર્ષમાં ચડત વ્યાજ સહિત બેંકને ભરપાઈ કરી આપવાની છે અને વ્યાજ દર મહિને જમા કરાવી આપવાનું છે, અન્યથા બેંક દર વર્ષે દર સેંકડે ૨.૦૦ % લેખે દંડનીય વ્યાજ સદર વ્યાજની રકમ ઉપરાંત વસુલ કરશે તે મને કબુલ-મંજુર છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૪.</span>
                            <span style="text-align: justify;">બેંક દ્વારા વ્યાજ દરમાં વધારા / ઘટાડાની જાહેરાત બેંકના નોટીસ બોર્ડ પર કરી તેની અમલવારી જાહેરાતમાં દર્શાવેલી તારીખથી કરશે જે મને કબુલ-મંજુર છે અને આવા વધારા / ઘટાડા અનુસાર બેંકને જે તે તારીખથી વ્યાજ ચુકવવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૫.</span>
                            <span style="text-align: justify;">હું બેંકનો સભાસદ / નોમિનલ સભાસદ છું અને બેંકના નિયમો તથા પેટા નિયમો વાંચ્યા અને સમજ્યા છે અને તે મને બંધનકર્તા છે અને તેમાં વખતોવખત જે ફેરફાર થાય તે પાળવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૬.</span>
                            <span style="text-align: justify;">મેં સોંપેલ દાગીના પર વારસનો હક છે. પરંતુ તેમને તે ખાતર કોઈપણ જાતનો વાંધો કરવાનો અધિકાર નથી.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૭.</span>
                            <span style="text-align: justify;">બેંક માંગે ત્યારે ધિરાણ મેળવેલ તમામ રકમ વ્યાજ સહીત ભરપાઈ કરવાની છે અને તેમ કરવામાં હું કસુર કરું તો બેંક થાલમાં મુકેલ દાગીના વેંચી શકે છે. આવી રીતે બેંકે વેંચેલ દાગીના પરત્વે મારે કશો વાંધો રહેશે નહિ, આ અંગેની સર્વ જવાબદારી મારી રહેશે અને જે કાંઈપણ ખર્ચ થશે તે મારે શિરે રહેશે, જે મારા વંશ-વારસોને કબુલ-મંજુર છે. દાગીના વેંચાતા ઉપજેલી કિંમતમાંથી બેંક પોતાનું લ્હેણું વસુલ કરી બાકી રકમ મને આપશે અથવા મારા વારસને આપશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૮.</span>
                            <span style="text-align: justify;">મેં થાલમાં મુકેલ દાગીના બેંક ફરીથી થાલમાં મૂકી શકશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૯.</span>
                            <span style="text-align: justify;">મેં બેંકને થાલમાં આપેલાં દાગીનાનું સીલબંધ પેકેટ RBI ના નિર્દેશો અનુસાર રીચેકીંગના હેતુ માટે સક્ષમ અધિકારી સમક્ષ ખોલીને રીચેકીંગ કરાવી શકશે જેમાં મારી હાજરીની જરૂરી રહેશે નહીં.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧૦.</span>
                            <span style="text-align: justify;">રીઝર્વ બેંક ઓફ ઇન્ડિયાની સહકારી બેંકો ઉપર વખતોવખત જારી કરેલી ધિરાણ ખાતાઓમાં વ્યાજ ઉધારવા અંગેની સૂચનાઓ અનુસાર આ ધિરાણ ખાતામાં વ્યાજ ઉધારશે તે મને કબુલ અને બંધનકર્તા છે.</span>
                        </div>
                    </div>

                    <!-- Footer: Location, Date (Left) and Borrower Signature (Right) -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; font-weight: 700; font-size: 14.5px;">
                        <div style="line-height: 1.5; text-align: left;">
                            <div>સ્થળઃ- ${loan.branchName}</div>
                            <div>તારીખઃ- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="height: 45px;"></div>
                            <div style="margin-bottom: 3px;">સહી X ...............................................................</div>
                            <div style="font-weight: 700; padding-right: 80px;">(${loan.borrowerName})</div>
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- PAGE 5: LETTER OF AUTHORIZATION (અધિકાર પત્ર) -->
                ${false ? `
                <div class="print-page-layout" style="padding: 10px 0; box-sizing:border-box; font-family:'Outfit', 'Noto Sans Gujarati', sans-serif; font-size:14.5px; line-height:1.45; color:#000000; background-color:#ffffff;">
                    <!-- Date on Right -->
                    <div style="text-align: right; font-weight: 700; margin-bottom: 8px;">
                        તારીખ :- ${formatDateDMY(loan.date)}
                    </div>

                    <!-- Centered Title -->
                    <div style="text-align: center; margin-bottom: 12px;">
                        <h2 style="font-size: 20px; font-weight: 800; margin: 0; text-decoration: underline;">અધિકાર પત્ર</h2>
                    </div>

                    <!-- Recipient -->
                    <div style="font-weight: 700; margin-bottom: 10px; line-height: 1.4;">
                        પ્રતિ,<br>
                        મેનેજર સાહેબ,<br>
                        ધી જૂનાગઢ કોમ. કો-ઓપ. બેંક લિ.<br>
                        ${loan.branchName} શાખા.
                    </div>

                    <!-- Opening declaration -->
                    <p style="margin-bottom: 10px; text-align: justify; text-indent: 30px;">
                        હું <strong>${loan.borrowerName}</strong> ધંધો : <strong>${loan.custOccupation || "-"}</strong>, ઉ.વ. <strong>${loan.custAge || "-"}</strong>, ધર્મે : <strong>${loan.custReligion || "-"}</strong>,  રહેવાસી : <strong>${loan.custAddress || "-"}</strong> નીચે પ્રમાણે લખી બંધાઉં છું કે :-
                    </p>

                    <!-- 10 Points List -->
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧.</span>
                            <span style="text-align: justify;">આજરોજ મારી પોતાની માલિકીના સોનાના દાગીના કે જેની નોંધ બેંક તરફથી મને મળેલ જુદી પહોંચમાં કરેલ છે, તે બેંકને થાલમાં આપી મેં રૂ. <strong>${parseFloat(loan.loanAmount).toLocaleString("en-IN")}/-</strong> અંકે રૂપિયા <strong>${gujWords}</strong> નું ધિરાણ મેળવેલ છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૨.</span>
                            <span style="text-align: justify;">સદરહુ રકમની આજરોજ મેં જુદી વચન ચિઠ્ઠી લખી છે અને ધિરાણની રકમ પર <strong>${loan.interestRate}</strong> ના વાર્ષિક વ્યાજ દરે, માસિક ચક્રવૃદ્ધિ લેખે ભરપાઈ કરવું છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૩.</span>
                            <span style="text-align: justify;">સદરહુ ધિરાણની રકમ ૧૨ માસમાં ચડત વ્યાજ સહિત બેંકને ભરપાઈ કરી આપવાની છે અને વ્યાજ દર મહિને જમા કરાવી આપવાનું છે, અન્યથા બેંક દર વર્ષે દર સેંકડે ૨.૦૦ % લેખે દંડનીય વ્યાજ સદર વ્યાજની રકમ ઉપરાંત વસુલ કરશે તે મને કબુલ-મંજુર છે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૪.</span>
                            <span style="text-align: justify;">બેંક દ્વારા વ્યાજ દરમાં વધારા / ઘટાડાની જાહેરાત બેંકના નોટીસ બોર્ડ પર કરી તેની અમલવારી જાહેરાતમાં દર્શાવેલી તારીખથી કરશે જે મને કબુલ-મંજુર છે અને આવા વધારા / ઘટાડા અનુસાર બેંકને જે તે તારીખથી વ્યાજ ચુકવવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૫.</span>
                            <span style="text-align: justify;">હું બેંકનો સભાસદ / નોમિનલ સભાસદ છું અને બેંકના નિયમો તથા પેટા નિયમો વાંચ્યા અને સમજ્યા છે અને તે મને બંધનકર્તા છે અને તેમાં વખતોવખત જે ફેરફાર થાય તે પાળવા બંધાઉં છું.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૬.</span>
                            <span style="text-align: justify;">મેં સોંપેલ દાગીના પર વારસનો હક છે. પરંતુ તેમને તે ખાતર કોઈપણ જાતનો વાંધો કરવાનો અધિકાર નથી.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૭.</span>
                            <span style="text-align: justify;">બેંક માંગે ત્યારે ધિરાણ મેળવેલ તમામ રકમ વ્યાજ સહીત ભરપાઈ કરવાની છે અને તેમ કરવામાં હું કસુર કરું તો બેંક થાલમાં મુકેલ દાગીના વેંચી શકે છે. આવી રીતે બેંકે વેંચેલ દાગીના પરત્વે મારે કશો વાંધો રહેશે નહિ, આ અંગેની સર્વ જવાબદારી મારી રહેશે અને જે કાંઈપણ ખર્ચ થશે તે મારે શિરે રહેશે, જે મારા વંશ-વારસોને કબુલ-મંજુર છે. દાગીના વેંચાતા ઉપજેલી કિંમતમાંથી બેંક પોતાનું લ્હેણું વસુલ કરી બાકી રકમ મને આપશે અથવા મારા વારસને આપશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૮.</span>
                            <span style="text-align: justify;">મેં થાલમાં મુકેલ દાગીના બેંક ફરીથી થાલમાં મૂકી શકશે.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૯.</span>
                            <span style="text-align: justify;">મેં બેંકને થાલમાં આપેલાં દાગીનાનું સીલબંધ પેકેટ RBI ના નિર્દેશો અનુસાર રીચેકીંગના હેતુ માટે સક્ષમ અધિકારી સમક્ષ ખોલીને રીચેકીંગ કરાવી શકશે જેમાં મારી હાજરીની જરૂરી રહેશે નહીં.</span>
                        </div>
                        <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                            <span style="font-weight: 800; min-width: 30px; flex-shrink: 0;">૧૦.</span>
                            <span style="text-align: justify;">રીઝર્વ બેંક ઓફ ઇન્ડિયાની સહકારી બેંકો ઉપર વખતોવખત જારી કરેલી ધિરાણ ખાતાઓમાં વ્યાજ ઉધારવા અંગેની સૂચનાઓ અનુસાર આ ધિરાણ ખાતામાં વ્યાજ ઉધારશે તે મને કબુલ અને બંધનકર્તા છે.</span>
                        </div>
                    </div>

                    <!-- Footer: Location, Date (Left) and Borrower Signature (Right) -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; font-weight: 700; font-size: 14.5px;">
                        <div style="line-height: 1.5; text-align: left;">
                            <div>સ્થળ : - ${loan.branchName}</div>
                            <div>તારીખ :- ${formatDateDMY(loan.date)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="height: 45px;"></div>
                            <div style="margin-bottom: 3px;">સહી X ...............................................................</div>
                            <div style="font-weight: 700; padding-right: 80px;">(${loan.borrowerName})</div>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    window.print();
}

// Convert Number to Gujarati Words
function numberToGujaratiWords(amount) {
    if (amount === 0) return "રૂપિયા શૂન્ય પુરા";
    const units = ['', 'એક', 'બે', 'ત્રણ', 'ચાર', 'પાંચ', 'છ', 'સાત', 'આઠ', 'નવ', 'દસ', 'અગિયાર', 'બાર', 'તેર', 'ચૌદ', 'પંદર', 'સોળ', 'સત્તર', 'અઢાર', 'ઓગણીસ'];
    const tens = ['', '', 'વીસ', 'ત્રીસ', 'ચાલીસ', 'પચાસ', 'સાઠ', 'સિત્તેર', 'એસી', 'નેવુ'];
    
    function convertLessThanThousand(n) {
        if (n === 0) return "";
        let str = "";
        if (n >= 100) {
            str += units[Math.floor(n / 100)] + " સો ";
            n %= 100;
        }
        if (n > 0) {
            if (n < 20) {
                str += units[n];
            } else {
                const digit = n % 10;
                str += tens[Math.floor(n / 10)];
                if (digit > 0) {
                    str += " " + units[digit];
                }
            }
        }
        return str.trim();
    }

    let num = Math.floor(amount);
    let words = "";

    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;

    if (crore > 0) {
        words += convertLessThanThousand(crore) + " કરોડ ";
    }
    if (lakh > 0) {
        words += convertLessThanThousand(lakh) + " લાખ ";
    }
    if (thousand > 0) {
        words += convertLessThanThousand(thousand) + " હજાર ";
    }
    if (num > 0) {
        words += convertLessThanThousand(num);
    }

    return "રૂપિયા " + words.trim() + " પુરા";
}

// ==================== IMAGE CROPPER & COMPRESSION UTILITY ====================
// Open Cropper Modal for photo cropping
function openCropModal(file, source) {
    activeCropSource = source;
    const modal = document.getElementById("crop-modal");
    const cropImg = document.getElementById("crop-image-element");
    if (!modal || !cropImg) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        cropImg.src = event.target.result;
        modal.classList.remove("hidden");

        // Destroy previous instance if it exists
        if (cropperInstance) {
            cropperInstance.destroy();
        }

        // Initialize Cropper.js
        const isSquare = (source === 'cust' || source === 'master-cust');
        cropperInstance = new Cropper(cropImg, {
            aspectRatio: isSquare ? 1 : NaN, // square for customer, free for gold
            viewMode: 1,
            autoCropArea: 1,
            responsive: true,
            restore: false
        });
    };
    reader.readAsDataURL(file);
}

// Close Cropper Modal and clean up
function closeCropModal() {
    const modal = document.getElementById("crop-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    // Reset file inputs so change events fire again even for same files
    document.getElementById("cust-photo-upload").value = "";
    document.getElementById("gold-photo-upload").value = "";
    document.getElementById("m-cust-photo-upload").value = "";
    activeCropSource = null;
}

// Initialize Cropper Event Handlers
function initCropperHandlers() {
    const btnSave = document.getElementById("btn-crop-save");
    const btnCancel = document.getElementById("btn-crop-cancel");
    const btnClose = document.getElementById("close-crop-modal-btn");

    if (btnSave) {
        btnSave.onclick = () => {
            if (!cropperInstance || !activeCropSource) return;

            const isSquare = (activeCropSource === 'cust' || activeCropSource === 'master-cust');
            // Export cropped canvas
            const canvas = cropperInstance.getCroppedCanvas(
                isSquare ? { width: 300, height: 300 } : { maxWidth: 600, maxHeight: 600 }
            );

            if (canvas) {
                // Convert to compressed jpeg data URL
                const base64 = canvas.toDataURL("image/jpeg", 0.7);

                if (activeCropSource === 'cust') {
                    currentUploadedCustPhoto = base64;
                    const preview = document.getElementById("cust-photo-preview");
                    if (preview) {
                        preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    }
                } else if (activeCropSource === 'gold') {
                    currentUploadedGoldPhoto = base64;
                    const preview = document.getElementById("gold-photo-preview");
                    if (preview) {
                        preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    }
                } else if (activeCropSource === 'master-cust') {
                    currentUploadedMasterCustPhoto = base64;
                    const preview = document.getElementById("m-cust-photo-preview");
                    if (preview) {
                        preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
                    }
                }
            }
            closeCropModal();
        };
    }

    if (btnCancel) {
        btnCancel.onclick = closeCropModal;
    }
    if (btnClose) {
        btnClose.onclick = closeCropModal;
    }
}

// ==================== PHOTO UPLOADS REGISTRY ====================
function initPhotoUploads() {
    const custPhotoUpload = document.getElementById("cust-photo-upload");
    const custPhotoPreview = document.getElementById("cust-photo-preview");
    if (custPhotoUpload && custPhotoPreview) {
        custPhotoUpload.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                openCropModal(file, 'cust');
            } else {
                currentUploadedCustPhoto = "";
                custPhotoPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
            }
        });
    }

    const goldPhotoUpload = document.getElementById("gold-photo-upload");
    const goldPhotoPreview = document.getElementById("gold-photo-preview");
    if (goldPhotoUpload && goldPhotoPreview) {
        goldPhotoUpload.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                openCropModal(file, 'gold');
            } else {
                currentUploadedGoldPhoto = "";
                goldPhotoPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Image Chosen</span>`;
            }
        });
    }

    const masterCustPhotoUpload = document.getElementById("m-cust-photo-upload");
    const masterCustPhotoPreview = document.getElementById("m-cust-photo-preview");
    if (masterCustPhotoUpload && masterCustPhotoPreview) {
        masterCustPhotoUpload.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                openCropModal(file, 'master-cust');
            } else {
                currentUploadedMasterCustPhoto = "";
                masterCustPhotoPreview.innerHTML = `<i class="fa-regular fa-image"></i><span>No Photo Selected</span>`;
            }
        });
    }
}

function openPrintModal(loanId) {
    currentPrintLoanId = loanId;
    const loan = state.loans.find(l => l.id === loanId);
    
    const btnSingle = document.getElementById("btn-print-single-a4");
    const btnThree = document.getElementById("btn-print-three-in-one");
    
    if (loan) {
        const is3553 = (loan.productCode === "GOD-3553" || loan.productCode === "3553");
        if (btnSingle) {
            if (is3553) {
                btnSingle.classList.remove("hidden");
            } else {
                btnSingle.classList.add("hidden");
            }
        }
        if (btnThree) {
            if (is3553) {
                btnThree.classList.add("hidden");
            } else {
                btnThree.classList.remove("hidden");
            }
        }
    }

    const modal = document.getElementById("print-modal");
    if (modal) {
        modal.classList.remove("hidden");
    }
}

function closePrintModal() {
    const modal = document.getElementById("print-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
    currentPrintLoanId = null;
}

function initPrintModal() {
    const closeBtn = document.getElementById("close-print-modal-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", closePrintModal);
    }

    const modal = document.getElementById("print-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closePrintModal();
            }
        });
    }

    document.getElementById("btn-print-single-a4").addEventListener("click", () => {
        if (currentPrintLoanId) {
            printVoucher(currentPrintLoanId, "single");
            closePrintModal();
        }
    });

    document.getElementById("btn-print-three-in-one").addEventListener("click", () => {
        if (currentPrintLoanId) {
            printVoucher(currentPrintLoanId, "three-in-one");
            closePrintModal();
        }
    });

    document.getElementById("btn-print-application-form").addEventListener("click", () => {
        if (currentPrintLoanId) {
            printVoucher(currentPrintLoanId, "application_form");
            closePrintModal();
        }
    });
}

// ==================== CUSTOMER MASTER DATABASE CRUD ====================
function renderCustomerMasterList() {
    const tbody = document.getElementById("customer-list-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const query = document.getElementById("customer-dir-search").value.toLowerCase();

    const filtered = state.customers.filter(c => {
        return !query || 
            c.custNo.toLowerCase().includes(query) || 
            c.name.toLowerCase().includes(query) || 
            c.mobile.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No customers found.</td></tr>`;
        return;
    }

    filtered.forEach(c => {
        const photoHtml = c.photo 
            ? `<img src="${c.photo}" style="width:35px; height:35px; object-fit:cover; border-radius:50%; border:1px solid #ddd;" />`
            : `<div style="width:35px; height:35px; border-radius:50%; background:#eee; display:flex; align-items:center; justify-content:center;"><i class="fa-regular fa-user" style="font-size:12px; color:#999;"></i></div>`;
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="text-center">${photoHtml}</td>
            <td><strong>${c.custNo}</strong>${c.memberNo && c.memberNo !== "-" ? `<br><small class="text-muted">Mem: ${c.memberNo}</small>` : ""}</td>
            <td>${c.name}</td>
            <td>${c.mobile}</td>
            <td>${c.nomineeName || "-"} <br><small class="text-muted">${c.nomineeRelation || ""}</small></td>
            <td>
                <div class="action-group">
                    <button class="btn-icon btn-icon-green" onclick="editCustomerProfile('${c.custNo}')" title="Edit">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteCustomerProfile('${c.custNo}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function initCustomerMasterForm() {
    const form = document.getElementById("customer-master-form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const editId = document.getElementById("edit-customer-id").value;
        const custNo = document.getElementById("m-cust-no").value.trim();
        const memberNo = document.getElementById("m-cust-member-no").value.trim() || "-";
        const name = document.getElementById("m-cust-name").value.trim();
        const address = document.getElementById("m-cust-address").value.trim();
        const savingsAc = document.getElementById("m-cust-savings-ac").value.trim();
        const age = parseInt(document.getElementById("m-cust-age").value);
        const occupation = document.getElementById("m-cust-occupation").value.trim();
        const religion = document.getElementById("m-cust-religion").value.trim();
        const mobile = document.getElementById("m-cust-mobile").value.trim();
        const nomineeName = document.getElementById("m-cust-nominee-name").value.trim();
        const nomineeRelation = document.getElementById("m-cust-nominee-relation").value.trim();

        if (!editId) {
            const exists = state.customers.some(c => c.custNo === custNo);
            if (exists) {
                alert("Error: A customer with this Customer Number already exists!");
                return;
            }
        }

        const customerObj = {
            custNo,
            memberNo,
            name,
            address,
            savingsAc,
            age,
            occupation,
            religion,
            mobile,
            nomineeName,
            nomineeRelation,
            photo: currentUploadedMasterCustPhoto
        };

        if (editId) {
            const index = state.customers.findIndex(c => c.custNo === editId);
            if (index !== -1) {
                if (editId !== custNo && state.customers.some(c => c.custNo === custNo)) {
                    alert("Error: The new Customer Number already exists!");
                    return;
                }
                state.customers[index] = customerObj;
                alert("Customer profile updated successfully.");
            }
        } else {
            state.customers.push(customerObj);
            alert("Customer profile registered successfully.");
        }

        saveState();
        resetCustomerMasterForm();
        renderCustomerMasterList();
    });

    const cancelBtn = document.getElementById("customer-cancel-edit-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", resetCustomerMasterForm);
    }

    const customerSearch = document.getElementById("customer-dir-search");
    if (customerSearch) {
        customerSearch.addEventListener("input", renderCustomerMasterList);
    }
}

function resetCustomerMasterForm() {
    const form = document.getElementById("customer-master-form");
    if (form) form.reset();
    document.getElementById("edit-customer-id").value = "";
    document.getElementById("customer-form-title").textContent = "Register New Customer";
    document.getElementById("customer-save-btn").innerHTML = '<i class="fa-solid fa-save"></i> Save Customer Profile';
    document.getElementById("customer-cancel-edit-btn").classList.add("hidden");
    document.getElementById("m-cust-no").disabled = false;
    currentUploadedMasterCustPhoto = "";
    document.getElementById("m-cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Photo Selected</span>`;
}

function editCustomerProfile(custNo) {
    const customer = state.customers.find(c => c.custNo === custNo);
    if (!customer) return;

    document.getElementById("edit-customer-id").value = customer.custNo;
    document.getElementById("m-cust-no").value = customer.custNo;
    document.getElementById("m-cust-no").disabled = true;
    document.getElementById("m-cust-member-no").value = customer.memberNo && customer.memberNo !== "-" ? customer.memberNo : "";

    document.getElementById("m-cust-name").value = customer.name || "";
    document.getElementById("m-cust-address").value = customer.address || "";
    document.getElementById("m-cust-savings-ac").value = customer.savingsAc || "";
    document.getElementById("m-cust-age").value = customer.age || "";
    document.getElementById("m-cust-occupation").value = customer.occupation || "";
    document.getElementById("m-cust-religion").value = customer.religion || "";
    document.getElementById("m-cust-mobile").value = customer.mobile || "";
    document.getElementById("m-cust-nominee-name").value = customer.nomineeName || "";
    document.getElementById("m-cust-nominee-relation").value = customer.nomineeRelation || "";

    if (customer.photo) {
        currentUploadedMasterCustPhoto = customer.photo;
        document.getElementById("m-cust-photo-preview").innerHTML = `<img src="${customer.photo}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;" />`;
    } else {
        currentUploadedMasterCustPhoto = "";
        document.getElementById("m-cust-photo-preview").innerHTML = `<i class="fa-regular fa-image"></i><span>No Photo Selected</span>`;
    }

    document.getElementById("customer-form-title").textContent = "Edit Customer Profile";
    document.getElementById("customer-save-btn").innerHTML = '<i class="fa-solid fa-check"></i> Update Customer Profile';
    document.getElementById("customer-cancel-edit-btn").classList.remove("hidden");
}

function deleteCustomerProfile(custNo) {
    if (confirm(`Are you sure you want to delete the profile for customer #${custNo}?`)) {
        state.customers = state.customers.filter(c => c.custNo !== custNo);
        saveState();
        renderCustomerMasterList();
    }
}

function upsertCustomerFromForm() {
    const custNo = document.getElementById("cust-no").value.trim();
    if (!custNo) return;

    const customerObj = {
        custNo: custNo,
        memberNo: document.getElementById("member-no").value.trim() || "-",
        name: document.getElementById("cust-name").value.trim(),
        address: document.getElementById("cust-address").value.trim(),
        savingsAc: document.getElementById("cust-savings-ac").value.trim(),
        age: parseInt(document.getElementById("cust-age").value) || 0,
        occupation: document.getElementById("cust-occupation").value.trim(),
        religion: document.getElementById("cust-religion").value.trim(),
        mobile: document.getElementById("cust-mobile").value.trim(),
        nomineeName: document.getElementById("cust-nominee-name").value.trim(),
        nomineeRelation: document.getElementById("cust-nominee-relation").value.trim(),
        photo: currentUploadedCustPhoto
    };

    const index = state.customers.findIndex(c => c.custNo === custNo);
    if (index !== -1) {
        if (!customerObj.photo && state.customers[index].photo) {
            customerObj.photo = state.customers[index].photo;
        }
        state.customers[index] = customerObj;
    } else {
        state.customers.push(customerObj);
    }
    saveState();
}

window.printVoucher = printVoucher;
window.deleteLoanRecord = deleteLoanRecord;
window.editLoanRecord = editLoanRecord;
window.deleteBranch = deleteBranch;
window.deleteValuer = deleteValuer;
window.openPrintModal = openPrintModal;
window.closePrintModal = closePrintModal;
window.editCustomerProfile = editCustomerProfile;
window.deleteCustomerProfile = deleteCustomerProfile;

// ==================== BACKUP CENTER INITIALIZATION ====================
function initBackupCenter() {
    const btnSelect = document.getElementById("btn-ho-backup-select");
    const btnManual = document.getElementById("btn-ho-backup-manual");

    if (btnSelect) {
        btnSelect.addEventListener("click", async () => {
            if (savedDirHandle) {
                const permission = await savedDirHandle.queryPermission({ mode: 'readwrite' });
                if (permission !== 'granted') {
                    const req = await savedDirHandle.requestPermission({ mode: 'readwrite' });
                    if (req === 'granted') {
                        updateBackupUI(savedDirHandle.name, false);
                        await backupAllBranchesData(false);
                        return;
                    }
                }
            }
            await selectNewBackupFolder();
        });
    }

    if (btnManual) {
        btnManual.addEventListener("click", async () => {
            await backupAllBranchesData(false);
        });
    }

    loadSavedBackupHandle();
    initAutoBackupScheduler();
}

// ==================== APP INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", async () => {
    await loadState();
    initTabs();
    initAuth();
    initFormSubmit();
    initPrintModal();
    initPhotoUploads();
    initCropperHandlers();
    initCustomerMasterForm();
    initBackupCenter();

    if (state.currentSession) {
        enterApp();
    } else {
        exitApp();
    }
});
