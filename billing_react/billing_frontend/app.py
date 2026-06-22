"""
app.py  —  Streamlit Frontend for Clothing Store Billing System
Connects to FastAPI backend via api_client.py
Run:  streamlit run app.py
"""

import base64, io, re, urllib.parse, datetime
import streamlit as st
import pandas as pd

from api_client import *

# ── PAGE CONFIG ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Clothing Store Billing",
    page_icon="👗",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── CONSTANTS ─────────────────────────────────────────────────────────────────
PAYMENT_MODES = ["Cash","UPI","Credit Card","Debit Card","Net Banking"]
LABEL_SIZES   = {"50 × 25 mm": (50, 25), "40 × 30 mm": (40, 30), "38 × 25 mm": (38, 25)}
SIZE_OPTIONS  = ["XS","S","M","L","XL","XXL","XXXL","28","30","32","34","36","38","40",
                 "2Y","4Y","6Y","8Y","10Y","12Y","Free Size"]
CATEGORIES    = ["All","Shirts","T-Shirts","Jeans","Trousers","Kurtis","Sarees","Lehenga",
                 "Jackets","Sweaters","Suits","Kids Wear","Accessories","Other"]
MEMBER_TYPES  = ["Regular","Silver","Gold","Platinum"]
GST_RATES     = [0,5,12,18,28]
ROLES         = ["Manager","Cashier","Viewer"]

# ── CSS ───────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* Sidebar */
[data-testid="stSidebar"]      {background:#1A237E;}
[data-testid="stSidebar"] *    {color:#fff !important;}
[data-testid="stSidebar"] hr   {border-color:#3949AB;}
[data-testid="stSidebar"] .stRadio label {color:#fff !important;}

/* Main background */
.main {background:#F8F9FA;}

/* KPI cards */
.kpi-card {
  background:#fff; border-radius:14px; padding:1.3rem 1.6rem;
  box-shadow:0 2px 12px rgba(0,0,0,.08); text-align:center;
  border-left:5px solid #3949AB; margin-bottom:8px;
}
.kpi-card h2 {font-size:2rem; margin:0; font-weight:700;}
.kpi-card p  {margin:4px 0 0; color:#666; font-size:.85rem;}

/* Inline boxes */
.green-box  {background:#E8F5E9;border:2px solid #66BB6A;border-radius:10px;padding:1rem 1.2rem;margin-top:.6rem;}
.blue-box   {background:#E3F2FD;border:2px solid #42A5F5;border-radius:10px;padding:1rem 1.2rem;margin-top:.8rem;}
.yellow-box {background:#FFF8E1;border:1.5px solid #FFB300;border-radius:10px;padding:.8rem 1rem;margin:.6rem 0;}

/* Receipt */
.thermal {
  font-family:'Courier New',monospace; font-size:13px; line-height:1.8;
  background:#fff; color:#000; max-width:310px; margin:0 auto;
  padding:20px 14px; border:1px dashed #aaa; border-radius:6px;
}
.thermal hr     {border:none; border-top:1px dashed #bbb; margin:6px 0;}
.thermal .tc    {text-align:center;}
.thermal .bold  {font-weight:700;}
.thermal .row   {display:flex; justify-content:space-between;}

/* Badges */
.badge-gold     {background:#FFC107;color:#000;padding:2px 9px;border-radius:20px;font-size:.75rem;font-weight:700;}
.badge-platinum {background:#9C27B0;color:#fff;padding:2px 9px;border-radius:20px;font-size:.75rem;font-weight:700;}
.badge-silver   {background:#90A4AE;color:#fff;padding:2px 9px;border-radius:20px;font-size:.75rem;}
.badge-regular  {background:#E0E0E0;color:#333;padding:2px 9px;border-radius:20px;font-size:.75rem;}

/* Buttons */
.wa-btn  {background:#25D366;color:#fff !important;border:none;padding:11px 28px;border-radius:8px;font-size:15px;cursor:pointer;margin:6px 4px;display:inline-block;text-decoration:none;font-weight:600;}
.pdf-btn {background:#D32F2F;color:#fff !important;border:none;padding:11px 28px;border-radius:8px;font-size:15px;cursor:pointer;margin:6px 4px;display:inline-block;text-decoration:none;font-weight:600;}

/* Login card */
.login-wrap {max-width:440px;margin:40px auto;background:#fff;padding:2.5rem 2rem;
  border-radius:16px;box-shadow:0 4px 24px rgba(26,35,126,.13);border-top:5px solid #1A237E;}
</style>
""", unsafe_allow_html=True)


# ── HELPERS ───────────────────────────────────────────────────────────────────
def safe_float(v, d=0.0):
    try: return float(str(v).replace(",","").strip() or d)
    except: return d

def build_stores_pdf(df) -> bytes:
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=1*cm, rightMargin=1*cm,
                            topMargin=1.5*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("Shopkeeper Report", styles["Title"]))
    story.append(Paragraph(f"Generated: {datetime.date.today().strftime('%d %b %Y')}", styles["Normal"]))
    story.append(Spacer(1, 0.4*cm))

    cols = list(df.columns)
    data = [cols] + df.astype(str).values.tolist()

    col_widths = [2.2*cm, 3*cm, 2.5*cm, 1.8*cm, 1.8*cm, 1.5*cm, 2.8*cm, 2.2*cm, 2.2*cm, 2.5*cm]
    col_widths = col_widths[:len(cols)]

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0),  colors.HexColor("#1A237E")),
        ("TEXTCOLOR",   (0,0), (-1,0),  colors.white),
        ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,0),  8),
        ("ALIGN",       (0,0), (-1,-1), "CENTER"),
        ("FONTSIZE",    (0,1), (-1,-1), 7.5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F3F4F9")]),
        ("GRID",        (0,0), (-1,-1), 0.4, colors.HexColor("#CCCCCC")),
        ("TOPPADDING",  (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
    ]))
    story.append(t)
    doc.build(story)
    return buf.getvalue()

def wa_link(bill, store_name, phone, store_profile=None):
    sp = store_profile or {}
    store_ph    = sp.get("phone","") or ""
    store_addr  = sp.get("address","") or ""
    store_gstin = sp.get("gstin","") or ""
    upi_id      = sp.get("upi_id","") or ""

    sep = "─" * 28

    items_txt = ""
    for it in bill.get("items",[]):
        name = it.get("product_name","")[:20]
        sz   = it.get("size","")
        qty  = it.get("qty",1)
        sub  = safe_float(it.get("subtotal",0))
        items_txt += f"  {name} ({sz}) ×{qty} = Rs.{sub:.0f}\n"

    disc_line = ""
    if safe_float(bill.get("discount",0)) > 0:
        dt = "%" if bill.get("discount_type","").startswith("%") else "Rs."
        disc_line = f"  Discount({dt})  : -Rs.{safe_float(bill['discount']):.0f}\n"

    upi_line = ""
    if upi_id:
        upi_line = (
            f"\n{sep}\n"
            f"💳 *Pay via UPI:*\n"
            f"  UPI ID : {upi_id}\n"
            f"  Amount : Rs.{int(safe_float(bill['grand_total']))}\n"
            f"  Ref    : {bill['bill_no']}\n"
        )

    msg = (
        f"🧾 *Receipt — {store_name}*\n"
        f"{sep}\n"
    )
    if store_addr:
        msg += f"📍 {store_addr}\n"
    if store_ph:
        msg += f"📞 {store_ph}"
    if store_gstin:
        msg += f"  |  GST: {store_gstin}"
    if store_ph or store_gstin:
        msg += "\n"

    msg += (
        f"{sep}\n"
        f"📄 *Bill No:* {bill['bill_no']}\n"
        f"📅 Date  : {bill['bill_date']}  {bill['bill_time']}\n"
        f"👤 Cust  : {bill.get('customer_name','Walk-in')}\n"
        f"{sep}\n"
        f"*ITEMS:*\n"
        f"{items_txt}"
        f"{sep}\n"
        f"  Subtotal : Rs.{safe_float(bill['subtotal']):.0f}\n"
        f"{disc_line}"
        f"  GST      : Rs.{safe_float(bill['gst_total']):.0f}\n"
        f"  *TOTAL   : Rs.{int(safe_float(bill['grand_total']))}*\n"
        f"{sep}\n"
        f"  Payment  : {bill.get('payment_mode','')}\n"
        f"  Paid     : Rs.{safe_float(bill['amount_paid']):.0f}\n"
    )
    if safe_float(bill.get("change_amt",0)) > 0:
        msg += f"  Change   : Rs.{safe_float(bill['change_amt']):.0f}\n"

    msg += upi_line
    msg += f"\n{sep}\n🙏 *Thank you! Visit again.*\n_Exchange within 7 days with receipt_"

    ph = re.sub(r"\D","",str(phone))
    if len(ph)==10: ph="91"+ph
    return f"https://wa.me/{ph}?text={urllib.parse.quote(msg)}"


def _upi_qr_html(upi_id, store_name, amount, bill_no, size_px=140):
    try:
        import qrcode
        upi_url = (
            f"upi://pay?pa={upi_id}&pn={urllib.parse.quote(store_name)}"
            f"&am={int(amount)}&cu=INR&tn=Bill%20{bill_no}"
        )
        qr  = qrcode.make(upi_url)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        return (
            f"<div style='text-align:center;margin:8px 0'>"
            f"<img src='data:image/png;base64,{b64}' "
            f"width='{size_px}' height='{size_px}' style='border:1px solid #ddd;border-radius:6px'/>"
            f"<div style='font-size:11px;color:#555;margin-top:4px'>"
            f"Scan &amp; Pay ₹{int(amount)}"
            f"</div><div style='font-size:10px;color:#888'>{upi_id}</div>"
            f"</div>"
        )
    except Exception:
        return ""

def pdf_link(pdf_bytes, bill_no):
    b64 = base64.b64encode(pdf_bytes).decode()
    return f"""<a href="data:application/pdf;base64,{b64}"
        target="_blank" download="Receipt_{bill_no}.pdf" class="pdf-btn">
        🖨️ Open Receipt PDF</a>
        <div style="font-size:11px;color:#666;margin-top:4px;">
        Opens in new tab → Ctrl+P → Thermal printer → 80mm paper</div>"""


def build_label_pdf(products, copies, size_mm, store_name):
    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.graphics.barcode import code128
        from reportlab.lib.units import mm as MM
        from reportlab.lib import colors

        W, H  = size_mm[0] * MM, size_mm[1] * MM
        buf   = io.BytesIO()
        c     = rl_canvas.Canvas(buf, pagesize=(W, H))
        mg    = 1.2 * MM

        # Proportional zones
        hdr_h  = H * 0.20          # dark header strip
        ftr_h  = H * 0.22          # MRP footer strip
        body_h = H - hdr_h - ftr_h # barcode + name zone

        for prod in products:
            bc = (prod.get("barcode") or
                  f"{prod.get('item_id','ITEM')}-{datetime.date.today().strftime('%y%m%d')}")
            mrp_val = safe_float(prod.get("mrp", 0))

            for _ in range(copies):
                # ── outer border ──
                c.setStrokeColor(colors.HexColor("#1A237E"))
                c.setLineWidth(0.5)
                c.rect(0, 0, W, H, fill=0, stroke=1)

                # ── header bar ──
                c.setFillColor(colors.HexColor("#1A237E"))
                c.rect(0, H - hdr_h, W, hdr_h, fill=1, stroke=0)
                c.setFillColor(colors.white)
                c.setFont("Helvetica-Bold", min(6.5, hdr_h * 0.52))
                c.drawCentredString(W / 2, H - hdr_h * 0.68, store_name[:30])

                # ── footer bar ──
                c.setFillColor(colors.HexColor("#F5F5F5"))
                c.rect(0, 0, W, ftr_h, fill=1, stroke=0)
                c.setFillColor(colors.HexColor("#1A237E"))
                c.setFont("Helvetica-Bold", min(8, ftr_h * 0.55))
                c.drawCentredString(W / 2, ftr_h * 0.32, f"MRP  Rs. {mrp_val:,.2f}")

                # ── body: product name ──
                c.setFillColor(colors.black)
                body_top = H - hdr_h
                name_y   = body_top - body_h * 0.28
                max_ch   = max(16, int(W / (2.1 * MM)))
                pname    = prod["product_name"]
                c.setFont("Helvetica-Bold", min(5.5, body_h * 0.22))
                c.drawCentredString(W / 2, name_y, pname[:max_ch])

                # thin rule under name
                c.setStrokeColor(colors.HexColor("#CCCCCC"))
                c.setLineWidth(0.25)
                c.line(mg * 2, name_y - 1.2 * MM, W - mg * 2, name_y - 1.2 * MM)

                # ── barcode ──
                bar_h   = body_h * 0.48
                bar_bot = ftr_h + (body_h - bar_h - body_h * 0.28 - 1.8 * MM) / 2
                try:
                    bco = code128.Code128(bc, barWidth=0.27 * MM, barHeight=bar_h,
                                         humanReadable=False)
                    bco.drawOn(c, (W - bco.width) / 2, bar_bot)
                except Exception:
                    pass

                # barcode text
                c.setFillColor(colors.HexColor("#555555"))
                c.setFont("Helvetica", min(3.5, body_h * 0.14))
                c.drawCentredString(W / 2, bar_bot - 2.2 * MM, bc)
                c.setFillColor(colors.black)

                c.showPage()

        c.save()
        return buf.getvalue()
    except ImportError:
        return None


# ══════════════════════════════════════════════════════════════════════════════
# LOGIN / REGISTER
# ══════════════════════════════════════════════════════════════════════════════
def show_login():
    st.markdown("""
    <div style="text-align:center;padding:2rem 0 1rem">
      <div style="font-size:4rem">👗</div>
      <h1 style="color:#1A237E;margin:4px 0;font-size:2.2rem">Readymade House</h1>
      <p style="color:#777;font-size:1rem">Billing & Inventory Management</p>
    </div>""", unsafe_allow_html=True)

    _, col, _ = st.columns([1, 2, 1])
    with col:
        tab_l, tab_r = st.tabs(["🔐 Login", "🏪 Register New Store"])

        # ── LOGIN ──
        with tab_l:
            st.markdown("<br>", unsafe_allow_html=True)
            with st.form("login_form"):
                uname = st.text_input("Username", placeholder="Enter username")
                passw = st.text_input("Password", type="password", placeholder="••••••••")
                sub   = st.form_submit_button("Login", type="primary", use_container_width=True)
            if sub:
                if not uname or not passw:
                    st.error("Enter username and password.")
                else:
                    res = login(uname, passw)
                    if res:
                        st.session_state.update({
                            "logged_in":  True,
                            "token":      res["access_token"],
                            "role":       res["role"],
                            "store_code": res.get("store_code") or "",
                            "store_name": res.get("store_name") or "Super Admin",
                            "username":   uname,
                        })
                        st.rerun()
            st.caption("Default admin: **admin** / **admin123** &nbsp;|&nbsp; Super admin has separate credentials.")

        # ── REGISTER ──
        with tab_r:
            st.markdown("<br>", unsafe_allow_html=True)
            with st.form("register_form"):
                r1, r2 = st.columns(2)
                sname = r1.text_input("Store Name *")
                uname = r2.text_input("Username *", placeholder="lowercase, no spaces")
                pw1   = r1.text_input("Password *", type="password")
                pw2   = r2.text_input("Confirm Password *", type="password")
                email = r1.text_input("Email *")
                phone = r2.text_input("Phone *")
                addr  = st.text_input("Store Address *")
                gstin = st.text_input("GSTIN (optional)")
                sub2  = st.form_submit_button("Register Store", type="primary", use_container_width=True)
            if sub2:
                res = register_store({
                    "store_name": sname, "owner_user": uname,
                    "password": pw1, "confirm_password": pw2,
                    "email": email, "phone": phone,
                    "address": addr, "gstin": gstin,
                })
                if res:
                    st.success(f"✅ {res['message']}")


# ── AUTH GATE ─────────────────────────────────────────────────────────────────
if not st.session_state.get("logged_in"):
    show_login()
    st.stop()

ROLE       = st.session_state.get("role", "Viewer")
UNAME      = st.session_state.get("username", "?")
STORE_NAME = st.session_state.get("store_name", "Store")
IS_SUPER   = (ROLE == "SuperAdmin")


# ══════════════════════════════════════════════════════════════════════════════
# SIDEBAR
# ══════════════════════════════════════════════════════════════════════════════
st.sidebar.markdown(f"## 👗 {STORE_NAME[:22]}")
st.sidebar.markdown("### Billing System")
st.sidebar.markdown("---")
st.sidebar.markdown(f"👤 **{UNAME}**")
st.sidebar.markdown(f"🏷️ `{ROLE}`")
st.sidebar.markdown("---")

ALL_PAGES = ["🏠 Dashboard","🛒 New Bill","📋 Bill History",
             "👤 Customers","👔 Products","🏷️ Barcode Labels",
             "📊 Reports","👥 Team","⚙️ Settings"]
ROLE_PAGES = {
    "Admin":      ALL_PAGES,
    "Manager":    ALL_PAGES[:-1],
    "Cashier":    ALL_PAGES[:4],
    "Viewer":     ["🏠 Dashboard","📋 Bill History","📊 Reports"],
    "SuperAdmin": ["🛡️ Super Admin"],
}
pages   = ROLE_PAGES.get(ROLE, ["🏠 Dashboard"])
if IS_SUPER:
    menu = "🛡️ Super Admin"
else:
    menu = st.sidebar.radio("Navigate", pages)

st.sidebar.markdown("---")
st.sidebar.caption(f"📅 {datetime.date.today().strftime('%d %b %Y')}")
if st.sidebar.button("🚪 Logout"):
    for k in ["logged_in","token","role","store_code","store_name","username","cart","sel_cust","last_bill","search_ctr","just_added"]:
        st.session_state.pop(k, None)
    st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# SUPER ADMIN DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════
if IS_SUPER:
    st.title("🛡️ Super Admin Dashboard")

    ov = admin_overview() or {}

    # ── KPI cards ──────────────────────────────────────────────────────────────
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.markdown(f'<div class="kpi-card"><h2>{ov.get("total_stores",0)}</h2><p>Total Stores</p></div>', unsafe_allow_html=True)
    c2.markdown(f'<div class="kpi-card" style="border-color:#2E7D32"><h2 style="color:#2E7D32">{ov.get("active_stores",0)}</h2><p>Active</p></div>', unsafe_allow_html=True)
    c3.markdown(f'<div class="kpi-card" style="border-color:#C62828"><h2 style="color:#C62828">{ov.get("inactive_stores",0)}</h2><p>Frozen</p></div>', unsafe_allow_html=True)
    c4.markdown(f'<div class="kpi-card" style="border-color:#E65100"><h2 style="color:#E65100">{ov.get("total_bills",0)}</h2><p>Total Bills</p></div>', unsafe_allow_html=True)
    c5.markdown(f'<div class="kpi-card" style="border-color:#6A1B9A"><h2 style="color:#6A1B9A">₹{ov.get("total_revenue",0):,.0f}</h2><p>Platform Revenue</p></div>', unsafe_allow_html=True)

    st.markdown("")
    m1, m2 = st.columns(2)
    m1.metric("Total Customers", ov.get("total_customers", 0))
    m2.metric("Total Products", ov.get("total_products", 0))

    plan_bd = ov.get("plan_breakdown", {})
    if plan_bd:
        plan_txt = "  |  ".join(f"**{k}**: {v}" for k, v in plan_bd.items())
        st.caption(f"Plans — {plan_txt}")

    st.markdown("---")

    # ── Revenue & bills charts ─────────────────────────────────────────────────
    daily = admin_daily_revenue() or []
    ch1, ch2, ch3 = st.columns(3)

    with ch1:
        st.subheader("Daily Revenue (₹)")
        if daily:
            df_daily = pd.DataFrame(daily).set_index("date")
            st.line_chart(df_daily["revenue"], use_container_width=True)
        else:
            st.info("No billing data yet.")

    with ch2:
        st.subheader("Daily Bills")
        if daily:
            df_daily2 = pd.DataFrame(daily).set_index("date")
            st.bar_chart(df_daily2["bills"], use_container_width=True)
        else:
            st.info("No billing data yet.")

    with ch3:
        st.subheader("Revenue by Store (₹)")
        by_store = admin_revenue_by_store() or []
        if by_store:
            df_store = pd.DataFrame(by_store).set_index("store")
            st.bar_chart(df_store["revenue"], use_container_width=True)
        else:
            st.info("No billing data yet.")

    st.markdown("---")

    # ── Store table ────────────────────────────────────────────────────────────
    st.subheader("All Stores")
    stores = admin_list_stores() or []

    if stores:
        sf1, sf2, sf3 = st.columns([3, 1, 1])
        search_q   = sf1.text_input("Search stores", placeholder="Store name, owner, or store code…", label_visibility="collapsed")
        filter_status = sf2.selectbox("Status", ["All", "Active", "Frozen"], label_visibility="collapsed")
        filter_plan   = sf3.selectbox("Plan", ["All"] + sorted({s.get("plan","Free") for s in stores}), label_visibility="collapsed")

        rows = []
        for s in stores:
            q = search_q.strip().lower()
            if q and q not in s["store_code"].lower() and q not in s["store_name"].lower() and q not in s["owner_user"].lower():
                continue
            if filter_status == "Active" and not s.get("is_active"):
                continue
            if filter_status == "Frozen" and s.get("is_active"):
                continue
            if filter_plan != "All" and s.get("plan","Free") != filter_plan:
                continue
            last = s.get("last_login","")
            if last and "T" in last:
                last = last.split("T")[0]
            rows.append({
                "Store Code":   s["store_code"],
                "Store Name":   s["store_name"],
                "Owner":        s["owner_user"],
                "Plan":         s.get("plan","Free"),
                "Status":       "Active" if s.get("is_active") else "Frozen",
                "Bills":        s.get("bills",0),
                "Revenue (₹)":  round(s.get("revenue",0),2),
                "Customers":    s.get("customers",0),
                "Products":     s.get("products",0),
                "Last Login":   last or "—",
            })

        if rows:
            df_stores = pd.DataFrame(rows)

            def _color_status(v):
                return "color:#2E7D32;font-weight:700" if v=="Active" else "color:#C62828;font-weight:700"

            st.dataframe(
                df_stores.style.map(_color_status, subset=["Status"]),
                use_container_width=True, hide_index=True,
            )
            cap_col, csv_col, pdf_col = st.columns([5, 1, 1])
            cap_col.caption(f"Showing {len(rows)} of {len(stores)} stores")
            csv_col.download_button(
                label="Export CSV",
                data=df_stores.to_csv(index=False),
                file_name=f"stores_{datetime.date.today()}.csv",
                mime="text/csv",
            )
            pdf_col.download_button(
                label="Export PDF",
                data=build_stores_pdf(df_stores),
                file_name=f"stores_{datetime.date.today()}.pdf",
                mime="application/pdf",
            )
        else:
            st.info("No stores match the filter.")
    else:
        st.info("No stores registered yet.")

    st.markdown("---")

    # ── Store management ───────────────────────────────────────────────────────
    st.subheader("Manage a Store")

    if stores:
        store_codes = [s["store_code"] for s in stores]
        store_labels = {s["store_code"]: f"{s['store_code']} — {s['store_name']} ({s['owner_user']})" for s in stores}
        sel_code = st.selectbox("Select store", store_codes, format_func=lambda x: store_labels[x])
        sel = next((s for s in stores if s["store_code"] == sel_code), {})

        tab_view, tab_plan, tab_freeze = st.tabs(["📋 Details", "💳 Change Plan", "🔒 Freeze / Unfreeze"])

        with tab_view:
            col1, col2 = st.columns(2)
            col1.markdown(f"**Store Code:** {sel.get('store_code','')}")
            col1.markdown(f"**Owner:** {sel.get('owner_user','')}")
            col1.markdown(f"**Plan:** {sel.get('plan','')}")
            col1.markdown(f"**Status:** {'Active' if sel.get('is_active') else 'Frozen'}")
            col2.markdown(f"**Bills:** {sel.get('bills',0)}")
            col2.markdown(f"**Revenue:** ₹{sel.get('revenue',0):,.2f}")
            col2.markdown(f"**Customers:** {sel.get('customers',0)}")
            col2.markdown(f"**Products:** {sel.get('products',0)}")
            ll = sel.get("last_login","")
            if ll and "T" in ll: ll = ll.replace("T"," ")[:19]
            col2.markdown(f"**Last Login:** {ll or '—'}")

        with tab_plan:
            with st.form("change_plan"):
                new_plan = st.selectbox("New Plan", ["Free","Basic","Pro","Enterprise"],
                                        index=["Free","Basic","Pro","Enterprise"].index(sel.get("plan","Free"))
                                        if sel.get("plan","Free") in ["Free","Basic","Pro","Enterprise"] else 0)
                new_notes = st.text_area("Notes (optional)", value=sel.get("notes","") or "")
                save_plan = st.form_submit_button("Save Changes", type="primary")
            if save_plan:
                res = admin_update_store(sel_code, {"plan": new_plan, "notes": new_notes})
                if res:
                    st.success(f"Plan updated to **{new_plan}**")
                    st.rerun()

        with tab_freeze:
            is_active = sel.get("is_active", True)
            action_label = "Freeze Store" if is_active else "Unfreeze Store"
            action_color = "red" if is_active else "green"
            st.markdown(f"Store is currently **:{action_color}[{'Active' if is_active else 'Frozen'}]**")
            if st.button(f"{'🔒' if is_active else '🔓'} {action_label}", type="primary"):
                res = admin_toggle_store(sel_code)
                if res:
                    st.success(res.get("message","Done"))
                    st.rerun()
    else:
        st.info("No stores to manage.")

    st.stop()


# ══════════════════════════════════════════════════════════════════════════════
# 1. DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "🏠 Dashboard":
    st.title(f"🏠 {STORE_NAME} — Dashboard")

    stats = get_dashboard() or {}
    c1,c2,c3,c4,c5 = st.columns(5)
    for col,val,label,color in [
        (c1, f"Rs.{safe_float(stats.get('total_revenue',0)):,.2f}", "Total Revenue",   "#1565C0"),
        (c2, str(stats.get("total_bills",0)),                        "Total Bills",     "#2E7D32"),
        (c3, str(stats.get("total_customers",0)),                    "Customers",       "#6A1B9A"),
        (c4, str(stats.get("total_products",0)),                     "Products",        "#E65100"),
        (c5, str(stats.get("low_stock_count",0)),                    "Low Stock ⚠️",    "#C62828"),
    ]:
        col.markdown(f"<div class='kpi-card' style='border-left-color:{color}'>"
                     f"<h2 style='color:{color}'>{val}</h2><p>{label}</p></div>",
                     unsafe_allow_html=True)

    st.markdown("---")
    cl, cr = st.columns(2)

    with cl:
        st.subheader("📈 Daily Revenue")
        daily = get_daily_sales() or []
        if daily:
            df = pd.DataFrame(daily)
            st.line_chart(df.set_index("date")["revenue"], height=220)
        else:
            st.info("No sales data yet.")

    with cr:
        st.subheader("⚠️ Low Stock Alert")
        low = get_low_stock() or []
        if low:
            st.dataframe(pd.DataFrame(low), use_container_width=True, height=220)
        else:
            st.success("✅ All products well stocked!")

    st.markdown("---")
    rl, rr = st.columns(2)
    with rl:
        st.subheader("🛍️ Sales by Category")
        cat = get_sales_by_category() or []
        if cat:
            df_c = pd.DataFrame(cat)
            st.bar_chart(df_c.set_index("category")["revenue"], height=220)
        else:
            st.info("No data yet.")

    with rr:
        st.subheader("💳 Revenue by Payment Mode")
        pay = get_sales_by_payment() or []
        if pay:
            df_p = pd.DataFrame(pay)
            st.bar_chart(df_p.set_index("payment_mode")["revenue"], height=220)
        else:
            st.info("No data yet.")


# ══════════════════════════════════════════════════════════════════════════════
# 2. NEW BILL
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "🛒 New Bill":
    st.title("🛒 New Bill")

    # ── Init session state ──
    if "cart"         not in st.session_state: st.session_state.cart         = []
    if "sel_cust"     not in st.session_state: st.session_state.sel_cust     = {}
    if "search_ctr" not in st.session_state: st.session_state.search_ctr = 0
    if "just_added" not in st.session_state: st.session_state.just_added = None

    # ════ STEP 1: CUSTOMER ════
    st.subheader("👤 Step 1 — Select Customer")
    c_col, w_col = st.columns([3,1])
    with c_col:
        phone_q = st.text_input("🔍 Search by Phone Number", placeholder="10-digit phone...")
    with w_col:
        st.markdown("<br>", unsafe_allow_html=True)
        walk_in = st.checkbox("Walk-in")

    if walk_in:
        st.session_state.sel_cust = {"customer_id":"WALKIN","name":"Walk-in",
                                      "phone":"","member_type":"Regular","loyalty_pts":0}
        st.info("👋 Walk-in customer selected.")

    elif phone_q:
        results = get_customers(search=phone_q)
        if results:
            opts = [f"{c['customer_id']} — {c['name']} ({c['phone']})" for c in results]
            ch   = st.selectbox("✅ Customer Found:", opts)
            row  = results[opts.index(ch)]
            st.session_state.sel_cust = row
            mt   = row.get("member_type","regular").lower()
            st.markdown(
                f"✅ **{row['name']}** <span class='badge-{mt}'>{row.get('member_type','Regular')}</span>"
                f" | 🎯 Points: **{row.get('loyalty_pts',0)}**",
                unsafe_allow_html=True)
        else:
            st.warning(f"📵 Phone **{phone_q}** not found.")
            st.markdown("<div class='green-box'>", unsafe_allow_html=True)
            st.markdown("#### ➕ Add New Customer")
            with st.form("quick_cust"):
                qa1,qa2 = st.columns(2)
                qn  = qa1.text_input("Full Name *")
                qph = qa2.text_input("Phone *", value=phone_q)
                qe  = qa1.text_input("Email")
                qg  = qa2.text_input("GST No.")
                qa  = st.text_input("Address")
                qb1,qb2,qb3 = st.columns(3)
                qci = qb1.text_input("City")
                qst = qb2.text_input("State")
                qpi = qb3.text_input("Pincode")
                qmt = st.selectbox("Member Type", MEMBER_TYPES)
                qno = st.text_input("Notes")
                qsv = st.form_submit_button("💾 Save & Select", type="primary")
            if qsv:
                if not qn or not qph:
                    st.error("Name and Phone required.")
                else:
                    res = create_customer({"name":qn,"phone":qph,"email":qe,"address":qa,
                        "city":qci,"state":qst,"pincode":qpi,"gst_no":qg,
                        "member_type":qmt,"notes":qno})
                    if res:
                        st.session_state.sel_cust = res
                        st.success(f"✅ Customer **{qn}** saved (ID: {res['customer_id']})!")
                        st.rerun()
            st.markdown("</div>", unsafe_allow_html=True)

    sc = st.session_state.sel_cust
    if sc and sc.get("customer_id"):
        st.caption(f"🛒 Billing to: **{sc.get('name','-')}** | 📞 {sc.get('phone','-')} | ID: `{sc.get('customer_id','-')}`")

    st.markdown("---")

    # ════ STEP 2: ADD ITEMS ════
    st.subheader("🛍️ Step 2 — Add Items to Cart")

    if st.session_state.just_added:
        st.success(st.session_state.just_added)
        st.session_state.just_added = None

    def _push_to_cart(prod, qty, sz, sp_override=None):
        sp  = safe_float(sp_override if sp_override is not None else prod.get("selling_price", 0))
        mrp = safe_float(prod.get("mrp", sp))
        gst = safe_float(prod.get("gst_pct", 5))
        if sp <= 0 and mrp > 0: sp = mrp
        disc = round((1 - sp / mrp) * 100, 1) if mrp > 0 else 0
        dup  = next((i for i, it in enumerate(st.session_state.cart)
                     if it["item_id"] == prod["item_id"] and it["size"] == sz), None)
        if dup is not None:
            new_qty = st.session_state.cart[dup]["qty"] + qty
            new_sub = round(sp * new_qty, 2)
            st.session_state.cart[dup].update({
                "qty": new_qty, "selling_price": sp, "discount_pct": disc,
                "subtotal": new_sub,
                "gst_amt":  round(new_sub * gst / 100, 2),
                "item_total": round(new_sub + new_sub * gst / 100, 2),
            })
            st.session_state.just_added = f"🔄 Updated **{prod['product_name']}** qty → {new_qty}"
        else:
            sub  = round(sp * qty, 2)
            gamt = round(sub * gst / 100, 2)
            st.session_state.cart.append({
                "item_id": prod["item_id"], "product_name": prod["product_name"],
                "category": prod.get("category",""), "size": sz,
                "color": prod.get("color",""), "qty": qty,
                "mrp": mrp, "selling_price": sp, "discount_pct": disc,
                "subtotal": sub, "gst_pct": gst, "gst_amt": gamt,
                "item_total": round(sub + gamt, 2),
            })
            st.session_state.just_added = f"✅ Added **{prod['product_name']}** × {qty}"
        st.session_state.search_ctr += 1

    # ── Quick-add form: type Item ID + press Enter ──
    with st.form("add_item_form", clear_on_submit=True):
        ia, ib, ic = st.columns([3, 1, 1])
        with ia:
            item_q = st.text_input(
                "🔍 Item ID or Name",
                placeholder="Type Item ID (e.g. ITM001) and press Enter",
                key=f"iq_{st.session_state.search_ctr}",
            )
        with ib:
            item_qty = st.number_input("Qty", min_value=1, max_value=500, value=1)
        with ic:
            item_sz = st.selectbox("Size", SIZE_OPTIONS, index=2)
        st.form_submit_button("➕ Add to Cart", type="primary", use_container_width=True)

    if item_q:
        query = item_q.strip()
        # Try exact item ID match first
        exact = get_product(query.upper()) or get_product(query)
        if exact:
            _push_to_cart(exact, item_qty, item_sz)
            st.rerun()
        else:
            prods = get_products(search=query)
            if prods:
                if len(prods) == 1:
                    _push_to_cart(prods[0], item_qty, item_sz)
                    st.rerun()
                else:
                    st.session_state["_hits"]     = prods
                    st.session_state["_hits_qty"] = item_qty
                    st.session_state["_hits_sz"]  = item_sz
            else:
                st.warning(f"No product found for **{query}**")

    # Multiple matches: show compact pick list
    if st.session_state.get("_hits"):
        st.info(f"Multiple matches — click to add:")
        for prod in st.session_state["_hits"][:12]:
            c1, c2 = st.columns([6, 1])
            c1.write(
                f"**{prod['item_id']}** — {prod['product_name']} "
                f"({prod.get('size','')})  MRP:Rs.{prod['mrp']:.0f}"
            )
            if c2.button("Add", key=f"_hit_{prod['item_id']}"):
                qty = st.session_state.pop("_hits_qty", 1)
                sz  = st.session_state.pop("_hits_sz", "M")
                st.session_state.pop("_hits", None)
                _push_to_cart(prod, qty, sz)
                st.rerun()

    # ── Custom product (collapsed by default) ──
    with st.expander("📦 Add Custom / Unlisted Product"):
        with st.form("custom_form", clear_on_submit=True):
            cf1,cf2 = st.columns(2)
            cn  = cf1.text_input("Product Name *")
            cc  = cf2.selectbox("Category", CATEGORIES[1:])
            cf3,cf4,cf5,cf6 = st.columns(4)
            cq  = cf3.number_input("Qty *", min_value=1, value=1)
            cp  = cf4.number_input("Price (Rs.) *", min_value=0.01, step=10.0, value=1.0)
            cg  = cf5.selectbox("GST %", GST_RATES, index=1)
            csz = cf6.selectbox("Size", SIZE_OPTIONS, index=3)
            ca  = st.form_submit_button("➕ Add Custom Item", type="primary")
        if ca:
            if not cn or cp <= 0:
                st.error("Product name and price required.")
            else:
                sub  = round(cp * cq, 2)
                gamt = round(sub * cg / 100, 2)
                st.session_state.cart.append({
                    "item_id": "CUSTOM", "product_name": cn, "category": cc,
                    "size": csz, "color": "", "qty": cq, "mrp": cp, "selling_price": cp,
                    "discount_pct": 0, "subtotal": sub, "gst_pct": cg,
                    "gst_amt": gamt, "item_total": round(sub + gamt, 2),
                })
                st.success(f"✅ Custom **{cn}** × {cq} added — Rs.{round(sub + gamt, 2):.2f}")
                st.rerun()

    # ════ STEP 3: CART ════
    if st.session_state.cart:
        st.markdown("---")
        st.subheader("🛒 Step 3 — Cart & Discount")

        cart_df = pd.DataFrame(st.session_state.cart)
        show_cols = [c for c in ["item_id","product_name","size","qty","mrp",
                                  "selling_price","discount_pct","subtotal",
                                  "gst_pct","gst_amt","item_total"] if c in cart_df.columns]
        st.dataframe(cart_df[show_cols], use_container_width=True, height=200)

        rc, _ = st.columns([2,5])
        with rc:
            ri = st.number_input("Remove row #", min_value=1,
                                  max_value=len(st.session_state.cart), value=1, step=1)
            if st.button("🗑 Remove Item"):
                st.session_state.cart.pop(ri-1); st.rerun()

        # Discount
        st.markdown("<div class='yellow-box'>", unsafe_allow_html=True)
        st.markdown("#### 🏷️ Cart Discount")
        dd1,dd2 = st.columns(2)
        with dd1: disc_type = st.radio("Type", ["% Percentage","Rs. Flat Amount"], horizontal=True, key="dtype")
        with dd2: disc_val  = st.number_input("Value", min_value=0.0, step=1.0, value=0.0, key="dval")
        st.markdown("</div>", unsafe_allow_html=True)

        raw_sub = sum(i["subtotal"] for i in st.session_state.cart)
        raw_gst = sum(i["gst_amt"]  for i in st.session_state.cart)
        disc    = round(raw_sub*disc_val/100,2) if disc_type.startswith("%") else min(disc_val,raw_sub)
        adj_sub = round(raw_sub-disc,2)
        adj_gst = round((raw_gst/raw_sub*adj_sub) if raw_sub else 0, 2)
        grand   = int(round(adj_sub+adj_gst))

        t1,t2,t3,t4 = st.columns(4)
        t1.metric("Subtotal",    f"Rs.{raw_sub:,.0f}")
        t2.metric("Discount 🏷️", f"−Rs.{disc:,.0f}", delta_color="off")
        t3.metric("GST",         f"Rs.{adj_gst:,.0f}")
        t4.metric("Grand Total", f"Rs.{grand:,}")

        st.markdown("---")
        st.subheader("💳 Step 4 — Payment")
        pa,pb,pc = st.columns(3)
        with pa: pmode = st.selectbox("Payment Mode", PAYMENT_MODES)
        with pb: paid  = st.number_input("Amount Paid (Rs.)", value=float(round(grand)), min_value=0.0, step=10.0)
        with pc:
            chng = paid - grand
            st.metric("Change / Balance", f"Rs.{chng:,.2f}", delta_color="off")

        notes = st.text_input("Notes (optional)")

        ba, bb = st.columns(2)
        with ba:
            if st.button("✅ Generate Bill", type="primary", use_container_width=True):
                sc = st.session_state.sel_cust
                if not sc or not sc.get("customer_id"):
                    st.error("Please select or add a customer first.")
                elif paid < grand:
                    st.error("Amount paid is less than grand total.")
                else:
                    bill_data = {
                        "customer_id":   sc.get("customer_id","WALKIN"),
                        "customer_name": sc.get("name","Walk-in"),
                        "phone":         sc.get("phone",""),
                        "items":         st.session_state.cart,
                        "discount":      disc,
                        "discount_type": "%" if disc_type.startswith("%") else "Rs.",
                        "payment_mode":  pmode,
                        "amount_paid":   paid,
                        "notes":         notes,
                    }
                    res = create_bill(bill_data)
                    if res:
                        st.session_state["last_bill"] = res
                        st.session_state.cart         = []
                        st.session_state.sel_cust     = {}
                        st.success(f"✅ Bill **{res['bill_no']}** generated!")
                        st.balloons()

        with bb:
            if st.button("🗑️ Clear Cart", use_container_width=True):
                st.session_state.cart = []; st.rerun()

    # ════ RECEIPT ════
    if "last_bill" in st.session_state:
        b = st.session_state["last_bill"]
        st.markdown("---")

        _sp = get_store_profile() or {}

        col_r, col_a = st.columns([1,1])

        with col_r:
            st.subheader("🧾 Receipt Preview")
            store_addr  = _sp.get("address","") or ""
            store_ph_r  = _sp.get("phone","") or ""
            store_gstin = _sp.get("gstin","") or ""
            upi_id_r    = _sp.get("upi_id","") or ""

            L = ["<div class='thermal'>"]
            L.append(f"<div class='tc bold' style='font-size:15px'>★ {STORE_NAME} ★</div>")
            if store_addr:
                L.append(f"<div class='tc' style='font-size:9px'>{store_addr}</div>")
            if store_ph_r:
                L.append(f"<div class='tc' style='font-size:9px'>Ph: {store_ph_r}"
                         + (f"  |  GSTIN: {store_gstin}" if store_gstin else "") + "</div>")
            L.append("<hr>")
            L.append(f"<div class='bold'>Bill # : {b['bill_no']}</div>")
            L.append(f"<div>Date   : {b['bill_date']}  {b['bill_time']}</div>")
            L.append(f"<div>Cust   : {b.get('customer_name','Walk-in')}</div>")
            L.append(f"<div>Phone  : {b.get('phone','-')}</div>")
            L.append("<hr>")
            L.append("<div class='row'><span class='bold'>Item</span><span class='bold'>Amt</span></div>")
            L.append("<hr>")
            for it in b.get("items",[]):
                L.append(f"<div>{str(it.get('product_name',''))[:22]} ({it.get('size','')})</div>")
                L.append(f"<div class='row'><span>{it.get('qty',1)}×Rs.{safe_float(it.get('selling_price',0)):.0f}</span>"
                         f"<span>Rs.{safe_float(it.get('subtotal',0)):.0f}</span></div>")
            L.append("<hr>")
            if safe_float(b.get("discount",0)) > 0:
                dt = "%" if b.get("discount_type","").startswith("%") else "Rs."
                L.append(f"<div class='row'><span>Discount({dt})</span><span>−Rs.{safe_float(b['discount']):.0f}</span></div>")
            L.append(f"<div class='row'><span>GST</span><span>Rs.{safe_float(b['gst_total']):.0f}</span></div>")
            L.append(f"<div class='row bold'><span>TOTAL</span><span>Rs.{int(safe_float(b['grand_total']))}</span></div>")
            L.append("<hr>")
            L.append(f"<div>Payment : {b.get('payment_mode','')}</div>")
            L.append(f"<div class='row'><span>Paid</span><span>Rs.{safe_float(b['amount_paid']):.0f}</span></div>")
            if safe_float(b.get("change_amt",0)) > 0:
                L.append(f"<div class='row'><span>Change</span><span>Rs.{safe_float(b['change_amt']):.0f}</span></div>")
            if upi_id_r:
                L.append("<hr>")
                L.append(_upi_qr_html(upi_id_r, STORE_NAME, safe_float(b['grand_total']), b['bill_no']))
            L.append("<hr>")
            L.append("<div class='tc bold'>★ Thank You! Visit Again ★</div>")
            L.append("<div class='tc' style='font-size:10px'>Exchange within 7 days with receipt</div>")
            L.append("</div>")
            st.markdown("".join(L), unsafe_allow_html=True)

        with col_a:
            st.subheader("📤 Actions")
            st.markdown("<br>", unsafe_allow_html=True)

            # PDF receipt
            pdf_bytes = get_receipt_pdf_bytes(b["bill_no"])
            if pdf_bytes:
                st.markdown(pdf_link(pdf_bytes, b["bill_no"]), unsafe_allow_html=True)

            st.markdown("<br>", unsafe_allow_html=True)

            # WhatsApp
            cust_phone = b.get("phone","")
            if cust_phone:
                wlink = wa_link(b, STORE_NAME, cust_phone, store_profile=_sp)
                st.markdown(f"<a href='{wlink}' target='_blank' class='wa-btn'>📲 Send on WhatsApp</a>",
                            unsafe_allow_html=True)
            else:
                st.info("No phone — WhatsApp unavailable")

            st.markdown("""
            <br>
            <div style="font-size:12px;color:#666;line-height:1.8">
            <b>How to print:</b><br>
            1. Click <b>Open Receipt PDF</b><br>
            2. Press <b>Ctrl+P</b> in the new tab<br>
            3. Select <b>thermal printer</b><br>
            4. Set paper to <b>80mm</b> → Print ✅
            </div>
            """, unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# 3. BILL HISTORY
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "📋 Bill History":
    st.title("📋 Bill History")

    f1,f2,f3 = st.columns(3)
    df_f = f1.text_input("Filter by Date (YYYY-MM-DD)")
    cf_f = f2.text_input("Filter by Customer")
    mf_f = f3.selectbox("Payment Mode", ["All"]+PAYMENT_MODES)

    bills = get_bills(date=df_f, customer=cf_f, payment_mode=mf_f)
    st.markdown(f"**{len(bills)} record(s) found**")

    if bills:
        df = pd.DataFrame(bills)
        show = [c for c in ["bill_no","bill_date","bill_time","customer_name",
                             "phone","grand_total","payment_mode","status"] if c in df.columns]
        st.dataframe(df[show], use_container_width=True, height=400)

        # View single bill detail
        st.markdown("---")
        st.subheader("🔍 View Bill Detail")
        bill_opts = [b["bill_no"] for b in bills]
        sel_bill  = st.selectbox("Select Bill", bill_opts)
        if st.button("View Full Bill"):
            detail = get_bill(sel_bill)
            if detail:
                st.session_state["last_bill"] = detail
                st.success(f"Bill {sel_bill} loaded — scroll up to New Bill to see receipt.")

        # Download
        buf = io.BytesIO()
        df.to_excel(buf, index=False)
        st.download_button("⬇️ Download as Excel", buf.getvalue(),
                           "bill_history.xlsx",
                           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    else:
        st.info("No bills found.")


# ══════════════════════════════════════════════════════════════════════════════
# 4. CUSTOMERS
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "👤 Customers":
    st.title("👤 Customer Management")
    tab1, tab2, tab3 = st.tabs(["📋 Customer List","➕ Add Customer","✏️ Edit Customer"])

    with tab1:
        srch = st.text_input("🔍 Search by Name / Phone / ID")
        custs = get_customers(search=srch)
        if custs:
            df = pd.DataFrame(custs)
            show = [c for c in ["customer_id","name","phone","email","city","member_type",
                                 "loyalty_pts","total_purchase","member_since"] if c in df.columns]
            st.dataframe(df[show], use_container_width=True, height=420)
            st.caption(f"{len(custs)} customer(s) found")
        else:
            st.info("No customers yet.")

    with tab2:
        with st.form("add_cust"):
            a1,a2 = st.columns(2)
            nm  = a1.text_input("Full Name *"); ph = a2.text_input("Phone *")
            em  = a1.text_input("Email");       gn = a2.text_input("GST No.")
            ad  = st.text_input("Address")
            b1,b2,b3 = st.columns(3)
            ci  = b1.text_input("City"); si = b2.text_input("State"); pi = b3.text_input("Pincode")
            mt  = st.selectbox("Member Type", MEMBER_TYPES)
            no  = st.text_input("Notes")
            sv  = st.form_submit_button("💾 Save Customer", type="primary")
        if sv:
            if not nm or not ph: st.error("Name and Phone required.")
            else:
                res = create_customer({"name":nm,"phone":ph,"email":em,"address":ad,
                    "city":ci,"state":si,"pincode":pi,"gst_no":gn,"member_type":mt,"notes":no})
                if res: st.success(f"✅ Customer **{nm}** added — ID: `{res['customer_id']}`")

    with tab3:
        cid_edit = st.text_input("Enter Customer ID to edit (e.g. CUST001)")
        if cid_edit:
            cust = get_customer(cid_edit)
            if cust:
                with st.form("edit_cust"):
                    ea1,ea2 = st.columns(2)
                    enm = ea1.text_input("Name",  value=cust.get("name",""))
                    eph = ea2.text_input("Phone", value=cust.get("phone",""))
                    eem = ea1.text_input("Email", value=cust.get("email",""))
                    ead = st.text_input("Address", value=cust.get("address",""))
                    emt = st.selectbox("Member Type", MEMBER_TYPES,
                                       index=MEMBER_TYPES.index(cust.get("member_type","Regular")))
                    elp = st.number_input("Loyalty Points", value=int(cust.get("loyalty_pts",0)), min_value=0)
                    eno = st.text_input("Notes", value=cust.get("notes",""))
                    esv = st.form_submit_button("💾 Update Customer", type="primary")
                if esv:
                    res = update_customer(cid_edit, {"name":enm,"phone":eph,"email":eem,
                        "address":ead,"member_type":emt,"loyalty_pts":elp,"notes":eno})
                    if res: st.success(f"✅ Customer `{cid_edit}` updated!")


# ══════════════════════════════════════════════════════════════════════════════
# 5. PRODUCTS
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "👔 Products":
    st.title("👔 Product Management")
    tab1, tab2, tab3 = st.tabs(["📋 Product List","➕ Add Product","📦 Stock Adjust"])

    with tab1:
        pc1,pc2 = st.columns(2)
        psrch = pc1.text_input("🔍 Search Product")
        pcat  = pc2.selectbox("Category", CATEGORIES)
        plow  = st.checkbox("Show Low Stock Only")
        prods = get_products(search=psrch, category=pcat, low_stock=plow)
        if prods:
            df = pd.DataFrame(prods)
            show = [c for c in ["item_id","product_name","category","size","mrp",
                                 "selling_price","gst_pct","stock_qty","min_stock",
                                 "barcode","inventory_date"] if c in df.columns]
            st.dataframe(df[show], use_container_width=True, height=420)
            st.caption(f"{len(prods)} product(s) found")
        else:
            st.info("No products found.")

    with tab2:
        with st.form("add_prod", clear_on_submit=True):
            pp1,pp2 = st.columns(2)
            pn  = pp1.text_input("Product Name *")
            pc  = pp2.selectbox("Category", CATEGORIES[1:])
            pb  = pp1.text_input("Brand")
            pm  = pp2.text_input("Material")
            psz = pp1.selectbox("Default Size", SIZE_OPTIONS, index=2)
            pco = pp2.text_input("Color")
            q1,q2,q3 = st.columns(3)
            pmrp = q1.number_input("MRP (Rs.) *", min_value=0.0, step=10.0)
            psp  = q2.number_input("Selling Price *", min_value=0.01, step=10.0, value=1.0)
            pgst = q3.selectbox("GST %", GST_RATES, index=1)
            r1,r2,r3 = st.columns(3)
            pstk = r1.number_input("Stock Qty",   min_value=0, step=1)
            pmn  = r2.number_input("Min Stock",   min_value=0, step=1, value=5)
            phsn = r3.text_input("HSN Code")
            pid_date = st.date_input("📦 Inventory Date", value=datetime.date.today())
            pdes = st.text_area("Description", height=60)
            st.info("🏷️ Barcode auto-generated as: ITEMID-YYMMDD")
            lc, bc1, bc2 = st.columns([2, 1, 1])
            with lc:
                plbl_size = st.selectbox("Label Size", list(LABEL_SIZES.keys()), key="prod_lbl_sz")
            with bc1:
                psv    = st.form_submit_button("💾 Save Product", type="primary", use_container_width=True)
            with bc2:
                pprint = st.form_submit_button("🖨️ Save & Print Label", use_container_width=True)
        if psv or pprint:
            if not pn or pmrp <= 0: st.error("Product Name and MRP required.")
            else:
                res = create_product({"product_name":pn,"category":pc,"brand":pb,
                    "size":psz,"color":pco,"material":pm,"mrp":pmrp,"selling_price":psp,
                    "gst_pct":pgst,"hsn_code":phsn,"stock_qty":pstk,"min_stock":pmn,
                    "description":pdes,"inventory_date":str(pid_date)})
                if res:
                    st.success(f"✅ Product **{pn}** saved — ID: `{res['item_id']}` | Barcode: `{res['barcode']}`")
                    if pprint:
                        pdf_bytes = build_label_pdf([res], 1, LABEL_SIZES[plbl_size], STORE_NAME)
                        if pdf_bytes:
                            st.download_button("⬇️ Download Label PDF", pdf_bytes,
                                               f"label_{res['item_id']}.pdf", "application/pdf",
                                               key="prod_lbl_dl")
                        else:
                            st.warning("Install reportlab to print labels: pip install reportlab")

    with tab3:
        st.subheader("📦 Adjust Stock Quantity")
        sa1,sa2,sa3 = st.columns(3)
        s_id    = sa1.text_input("Item ID (e.g. ITM001)")
        s_delta = sa2.number_input("Quantity Change", step=1, value=0,
                                    help="Positive = restock, Negative = sold/damaged")
        if sa3.button("Update Stock", type="primary"):
            if not s_id: st.error("Enter an Item ID.")
            elif s_delta == 0: st.warning("Delta is 0 — nothing to update.")
            else:
                res = adjust_stock(s_id, int(s_delta))
                if res:
                    arrow = "📈" if s_delta > 0 else "📉"
                    st.success(f"{arrow} Stock updated for `{s_id}`: now **{res['stock_qty']}** units.")


# ══════════════════════════════════════════════════════════════════════════════
# 6. BARCODE LABELS
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "🏷️ Barcode Labels":
    st.title("🏷️ Barcode Label Printer")

    bl1, bl2, bl3 = st.columns(3)
    cat_s    = bl1.selectbox("Filter by Category", CATEGORIES)
    lbl_name = bl2.selectbox("Label Size", list(LABEL_SIZES.keys()))
    copies   = bl3.number_input("Labels per product", min_value=1, max_value=200, value=2)
    st.caption(f"Selected size: **{lbl_name}** — set matching paper size on your label printer")

    prods = get_products(category=cat_s)

    if not prods:
        st.warning("No products found.")
    else:
        opts     = [f"{p['item_id']} — {p['product_name']} (MRP Rs.{p['mrp']:.0f})" for p in prods]
        selected = st.multiselect("Pick products to print labels for:", opts)

        if st.button("🖨️ Generate Label PDF", type="primary") and selected:
            sel_prods = [next(p for p in prods if p["item_id"] == opt.split(" — ")[0])
                         for opt in selected]
            pdf_bytes = build_label_pdf(sel_prods, copies, LABEL_SIZES[lbl_name], STORE_NAME)
            if pdf_bytes:
                st.download_button("⬇️ Download Labels PDF", pdf_bytes,
                                   "labels.pdf", "application/pdf")
                st.success(f"✅ {len(selected) * copies} label(s) generated!")
            else:
                st.error("reportlab not installed. Run: pip install reportlab")

        st.markdown("---")
        st.dataframe(pd.DataFrame(prods)[[c for c in ["item_id","product_name",
            "category","mrp","barcode","inventory_date","stock_qty"] if c in pd.DataFrame(prods).columns]],
            use_container_width=True, height=350)


# ══════════════════════════════════════════════════════════════════════════════
# 7. REPORTS
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "📊 Reports":
    st.title("📊 Reports & Analytics")

    r1,r2 = st.columns(2)
    with r1:
        st.subheader("🛍️ Sales by Category")
        cat = get_sales_by_category() or []
        if cat:
            st.bar_chart(pd.DataFrame(cat).set_index("category")["revenue"], height=260)
        else: st.info("No data yet.")

    with r2:
        st.subheader("💳 Revenue by Payment Mode")
        pay = get_sales_by_payment() or []
        if pay:
            st.bar_chart(pd.DataFrame(pay).set_index("payment_mode")["revenue"], height=260)
        else: st.info("No data yet.")

    st.markdown("---")
    r3,r4 = st.columns(2)
    with r3:
        st.subheader("📈 Daily Revenue")
        daily = get_daily_sales() or []
        if daily:
            st.line_chart(pd.DataFrame(daily).set_index("date")["revenue"], height=250)
        else: st.info("No data yet.")

    with r4:
        st.subheader("🏆 Top Products by Units")
        top = get_top_products() or []
        if top:
            st.bar_chart(pd.DataFrame(top).set_index("product")["units_sold"], height=250)
        else: st.info("No data yet.")

    st.markdown("---")
    st.subheader("📄 GST Summary")
    gst = get_gst_summary() or []
    if gst:
        df_g = pd.DataFrame(gst)
        df_g.columns = ["GST Rate %","Line Items","Taxable Value (Rs.)","GST Collected (Rs.)"]
        st.dataframe(df_g, use_container_width=True)
        buf = io.BytesIO()
        df_g.to_excel(buf, index=False)
        st.download_button("⬇️ Download GST Report", buf.getvalue(),
                           "gst_summary.xlsx",
                           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    else:
        st.info("No GST data yet.")


# ══════════════════════════════════════════════════════════════════════════════
# 8. TEAM
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "👥 Team":
    if ROLE not in ("Admin", "Manager"):
        st.error("Admin or Manager access required.")
        st.stop()

    st.title("👥 Team Management")
    tab1, tab2, tab3 = st.tabs(["All Users","Add User","Change Password"])

    with tab1:
        team = get_team()
        if team:
            df = pd.DataFrame(team)
            show = [c for c in ["username","full_name","role","is_active","created_at"] if c in df.columns]
            df_show = df[show].copy()
            if "is_active" in df_show.columns:
                df_show["is_active"] = df_show["is_active"].map({True:"✅ Active",False:"❄️ Inactive",1:"✅ Active",0:"❄️ Inactive"})
            st.dataframe(df_show, use_container_width=True      , height=300)

            st.markdown("---"); st.subheader("Toggle User Status")
            unames = [u["username"] for u in team]
            tgt    = st.selectbox("Select user", unames)
            if st.button("Toggle Active / Inactive"):
                res = toggle_team_user(tgt)
                if res: st.success(f"Status updated for **{tgt}**"); st.rerun()
        else:
            st.info("No team members yet.")

    with tab2:
        with st.form("add_team_user"):
            tu1,tu2 = st.columns(2)
            tun = tu1.text_input("Username *")
            tfn = tu2.text_input("Full Name *")
            tpw = tu1.text_input("Password *", type="password")
            trl = tu2.selectbox("Role", ROLES)
            tsv = st.form_submit_button("Create User", type="primary")
        if tsv:
            if not tun or not tpw: st.error("Username and password required.")
            elif len(tpw) < 6: st.error("Password min 6 characters.")
            else:
                res = create_team_user({"username":tun,"password":tpw,"full_name":tfn,"role":trl})
                if res: st.success(f"✅ User **{tun}** created with role **{trl}**")

    with tab3:
        team2 = get_team()
        if team2:
            with st.form("change_pw"):
                cpu = st.selectbox("Select User", [u["username"] for u in team2])
                cpp = st.text_input("New Password *", type="password")
                cpc = st.text_input("Confirm *", type="password")
                cps = st.form_submit_button("Update Password", type="primary")
            if cps:
                if not cpp or cpp != cpc: st.error("Passwords don't match.")
                elif len(cpp) < 6: st.error("Min 6 characters.")
                else:
                    res = change_team_password(cpu, {"new_password":cpp,"confirm_password":cpc})
                    if res: st.success(f"✅ Password updated for **{cpu}**")
        else:
            st.info("Add users first.")


# ══════════════════════════════════════════════════════════════════════════════
# 9. SETTINGS
# ══════════════════════════════════════════════════════════════════════════════
elif menu == "⚙️ Settings":
    if ROLE not in ("Admin",):
        st.error("Admin access required.")
        st.stop()

    st.title("⚙️ Store Settings")

    profile = get_store_profile() or {}

    tab_s1, tab_s2 = st.tabs(["🏪 Store Info", "💳 UPI / Payment"])

    with tab_s1:
        with st.form("store_info_form"):
            si1, si2 = st.columns(2)
            sn  = si1.text_input("Store Name",  value=profile.get("store_name",""))
            se  = si2.text_input("Email",        value=profile.get("email","") or "")
            sp2 = si1.text_input("Phone",        value=profile.get("phone","") or "")
            sg  = si2.text_input("GSTIN",        value=profile.get("gstin","") or "")
            sa  = st.text_area("Address",        value=profile.get("address","") or "", height=80)
            save_info = st.form_submit_button("💾 Save Store Info", type="primary")
        if save_info:
            res = update_store_profile({"store_name":sn,"email":se,"phone":sp2,"gstin":sg,"address":sa})
            if res:
                st.success("✅ Store info updated!")
                st.rerun()

    with tab_s2:
        st.markdown("#### 💳 UPI ID for Payment QR Code")
        st.info(
            "Add your UPI ID below. A QR code will automatically appear on every receipt "
            "so customers can scan and pay the exact bill amount instantly."
        )
        with st.form("upi_form"):
            upi_val = st.text_input(
                "UPI ID",
                value=profile.get("upi_id","") or "",
                placeholder="e.g. shopname@upi or 9876543210@paytm",
            )
            save_upi = st.form_submit_button("💾 Save UPI ID", type="primary")
        if save_upi:
            res = update_store_profile({"upi_id": upi_val.strip()})
            if res:
                st.success(f"✅ UPI ID **{upi_val.strip()}** saved!")
                if upi_val.strip():
                    st.markdown("**Preview QR Code:**")
                    st.markdown(
                        _upi_qr_html(upi_val.strip(), STORE_NAME, 100, "DEMO", size_px=160),
                        unsafe_allow_html=True
                    )
                    st.caption("This is a demo QR with Rs.100 — actual QR on receipt will have the real bill amount.")
