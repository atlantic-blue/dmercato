import { Tenant, Product, MarketDate, OperationalSlot } from '@dmercato/types';
import { SeoMetadata, OgTags } from './seo';
import { escapeHtml, escapeJsonLd } from './escape';

interface RenderHtmlTemplateInput {
  tenant: Tenant;
  seoMetadata: SeoMetadata;
  assetsBaseUrl: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function renderOgTags(ogTags: OgTags): string {
  return Object.entries(ogTags)
    .map(([property, content]) =>
      `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`
    )
    .join('\n    ');
}

function renderJsonLd(jsonLd: Record<string, unknown>): string {
  const safeJson = escapeJsonLd(JSON.stringify(jsonLd));
  return `<script type="application/ld+json">${safeJson}</script>`;
}

function formatPrice(price: number, currency: string): string {
  const currencySymbols: Record<string, string> = {
    aud: '$',
    gbp: '\u00A3',
    usd: '$',
  };
  const symbol = currencySymbols[currency] ?? '$';
  return `${symbol}${(price / 100).toFixed(2)}`;
}

function renderProductCard(
  product: Product,
  assetsBaseUrl: string,
  stripeReady: boolean
): string {
  const disabledAttr = stripeReady ? '' : ' disabled';
  const disabledClass = stripeReady ? '' : ' opacity-50 cursor-not-allowed';

  return `<div class="product-card">
      <div class="product-image" style="background-image:url('${escapeHtml(assetsBaseUrl)}/${escapeHtml(product.imageKey)}')"></div>
      <h3 class="product-name">${escapeHtml(product.name)}</h3>
      <p class="product-description">${escapeHtml(product.description)}</p>
      <div class="product-footer">
        <span class="product-price">${formatPrice(product.price, product.currency)}</span>
        <button class="add-to-cart${disabledClass}" data-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-price="${product.price}" data-currency="${escapeHtml(product.currency)}"${disabledAttr}>Add to Cart</button>
      </div>
    </div>`;
}

function renderProductsSection(
  products: Product[],
  assetsBaseUrl: string,
  stripeReady: boolean
): string {
  if (products.length === 0) {
    return '';
  }

  const cards = products
    .sort((a, b) => a.order - b.order)
    .map((product) => renderProductCard(product, assetsBaseUrl, stripeReady))
    .join('\n    ');

  return `<section id="products" class="products-section">
    <h2 class="section-title">Products</h2>
    <div class="products-grid">
    ${cards}
    </div>
  </section>`;
}

function renderMarketDate(marketDate: MarketDate): string {
  return `<div class="market-date-row">
      <div class="market-date-info">
        <span class="market-date-dot"></span>
        <span class="market-date-value">${escapeHtml(marketDate.date)}</span>
      </div>
      <div class="market-date-details">
        <p class="market-name">${escapeHtml(marketDate.marketName)}</p>
        <p class="market-location">${escapeHtml(marketDate.location)}</p>
        <p class="market-address">${escapeHtml(marketDate.address)}</p>
      </div>
    </div>`;
}

function renderMarketCalendar(marketDates: MarketDate[]): string {
  if (marketDates.length === 0) {
    return '';
  }

  const rows = marketDates
    .map((date) => renderMarketDate(date))
    .join('\n    ');

  return `<section id="market-dates" class="market-section">
    <h2 class="section-title">Market Dates</h2>
    ${rows}
  </section>`;
}

function renderScheduleSlot(slot: OperationalSlot): string {
  const dayName = DAY_NAMES[slot.dayOfWeek] ?? 'Unknown';
  return `<div class="schedule-slot">
      <span class="schedule-day">${escapeHtml(dayName)}</span>
      <span class="schedule-time">${escapeHtml(slot.startTime)} - ${escapeHtml(slot.endTime)}</span>
    </div>`;
}

function renderOperationalSchedule(
  schedule: OperationalSlot[]
): string {
  if (schedule.length === 0) {
    return '';
  }

  const slots = schedule
    .map((slot) => renderScheduleSlot(slot))
    .join('\n    ');

  return `<section id="schedule" class="schedule-section">
    <h2 class="section-title">Hours</h2>
    ${slots}
  </section>`;
}

function renderDeliveryInfo(tenant: Tenant): string {
  const parts: string[] = [];

  if (tenant.takeoutEnabled) {
    parts.push('<span class="fulfilment-badge">Takeout Available</span>');
  }

  if (tenant.deliveryEnabled) {
    const feeText = tenant.deliveryFee > 0
      ? `Delivery (${formatPrice(tenant.deliveryFee, 'aud')} fee)`
      : 'Free Delivery';
    parts.push(`<span class="fulfilment-badge">${feeText}</span>`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `<div class="fulfilment-info">${parts.join(' ')}</div>`;
}

function renderCartDrawer(tenant: Tenant): string {
  return `<div id="cart-drawer" class="cart-drawer" aria-hidden="true">
    <div class="cart-overlay" onclick="toggleCart()"></div>
    <div class="cart-panel">
      <div class="cart-header">
        <h2>Your Cart</h2>
        <button class="cart-close" onclick="toggleCart()" aria-label="Close cart">&times;</button>
      </div>
      <div id="cart-items" class="cart-items"></div>
      <div class="cart-summary">
        <div class="cart-subtotal">
          <span>Subtotal</span>
          <span id="cart-subtotal-value">$0.00</span>
        </div>
        ${tenant.deliveryEnabled ? `<div class="cart-delivery-fee">
          <span>Delivery Fee</span>
          <span id="cart-delivery-fee">${formatPrice(tenant.deliveryFee, 'aud')}</span>
        </div>` : ''}
        <div class="cart-total">
          <span>Total</span>
          <span id="cart-total-value">$0.00</span>
        </div>
      </div>
      <form id="checkout-form" class="checkout-form">
        <h3>Checkout</h3>
        <label for="checkout-name">Name</label>
        <input type="text" id="checkout-name" name="name" required placeholder="Your name" />
        <label for="checkout-email">Email</label>
        <input type="email" id="checkout-email" name="email" required placeholder="your@email.com" />
        <label for="checkout-phone">Phone</label>
        <input type="tel" id="checkout-phone" name="phone" placeholder="Phone number" />
        <label for="checkout-fulfilment">Fulfilment</label>
        <select id="checkout-fulfilment" name="fulfilment">
          ${tenant.takeoutEnabled ? '<option value="takeout">Takeout</option>' : ''}
          ${tenant.deliveryEnabled ? '<option value="delivery">Delivery</option>' : ''}
        </select>
        <label for="checkout-date">Preferred Date</label>
        <input type="date" id="checkout-date" name="date" required />
        <label for="checkout-time">Preferred Time</label>
        <input type="time" id="checkout-time" name="time" required />
        <label for="checkout-notes">Delivery Notes</label>
        <textarea id="checkout-notes" name="notes" placeholder="Any special instructions"></textarea>
        <button type="submit" class="checkout-button">Pay Now</button>
      </form>
    </div>
  </div>`;
}

function renderQuoteForm(): string {
  return `<section id="book-event" class="quote-section">
    <h2 class="section-title">Book an Event</h2>
    <form class="quote-form">
      <input type="text" name="name" placeholder="Your Name" required />
      <input type="email" name="email" placeholder="Email" required />
      <select name="eventType">
        <option value="corporate">Corporate</option>
        <option value="birthday">Birthday</option>
        <option value="wedding">Wedding</option>
        <option value="market">Market</option>
        <option value="other">Other</option>
      </select>
      <input type="number" name="guestCount" placeholder="Guest Count" min="1" />
      <input type="date" name="eventDate" />
      <textarea name="message" placeholder="Tell us about your event"></textarea>
      <button type="submit" class="quote-submit">Request Quote</button>
    </form>
  </section>`;
}

function renderMoreInCity(tenant: Tenant): string {
  return `<section class="more-in-city">
    <p>Discover more vendors in <strong>${escapeHtml(tenant.city)}</strong></p>
  </section>`;
}

function renderMobileBottomNav(): string {
  return `<nav class="mobile-bottom-nav">
    <a href="#products">Products</a>
    <a href="#market-dates">Markets</a>
    <button onclick="toggleCart()" aria-label="Open cart">Cart</button>
    <a href="#book-event">Events</a>
  </nav>`;
}

function renderCartScript(): string {
  return `<script>
    (function(){
      var CART_KEY = 'dmercato_cart';
      function getCart(){
        try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
        catch(e){ return []; }
      }
      function saveCart(cart){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
      function toggleCart(){
        var d = document.getElementById('cart-drawer');
        if(d){ d.setAttribute('aria-hidden', d.getAttribute('aria-hidden')==='true'?'false':'true'); }
      }
      window.toggleCart = toggleCart;
      function updateCartDisplay(){
        var cart = getCart();
        var container = document.getElementById('cart-items');
        if(!container) return;
        container.innerHTML = '';
        cart.forEach(function(item){
          var row = document.createElement('div');
          row.className = 'cart-item';
          var nameSpan = document.createElement('span');
          nameSpan.textContent = item.name + ' x' + item.qty;
          var priceSpan = document.createElement('span');
          priceSpan.textContent = '$' + (item.price * item.qty / 100).toFixed(2);
          row.appendChild(nameSpan);
          row.appendChild(priceSpan);
          container.appendChild(row);
        });
        var subtotal = cart.reduce(function(s,i){ return s + i.price*i.qty; }, 0);
        var el = document.getElementById('cart-subtotal-value');
        if(el) el.textContent = '$'+(subtotal/100).toFixed(2);
        var tel = document.getElementById('cart-total-value');
        if(tel) tel.textContent = '$'+(subtotal/100).toFixed(2);
      }
      document.addEventListener('click', function(e){
        var btn = e.target.closest('.add-to-cart');
        if(!btn || btn.disabled) return;
        var cart = getCart();
        var id = btn.dataset.id;
        var found = false;
        for(var i=0;i<cart.length;i++){
          if(cart[i].id===id){ cart[i].qty++; found=true; break; }
        }
        if(!found) cart.push({id:id,name:btn.dataset.name,price:parseInt(btn.dataset.price,10),currency:btn.dataset.currency,qty:1});
        saveCart(cart);
        updateCartDisplay();
        toggleCart();
      });
      var stripeCheckout = null;
      window.closeCheckout = function(){
        document.getElementById('checkout-overlay').style.display = 'none';
        if(stripeCheckout){ stripeCheckout.destroy(); stripeCheckout = null; }
      };
      var checkoutForm = document.getElementById('checkout-form');
      if(checkoutForm){
        checkoutForm.addEventListener('submit', function(e){
          e.preventDefault();
          var cart = getCart();
          if(cart.length === 0){ alert('Your cart is empty'); return; }
          var btn = checkoutForm.querySelector('.checkout-button');
          btn.disabled = true;
          btn.textContent = 'Processing...';
          var payload = {
            vendorSlug: window.VENDOR_SLUG,
            items: cart.map(function(item){ return { productId: item.id, quantity: item.qty }; }),
            customerName: document.getElementById('checkout-name').value,
            customerEmail: document.getElementById('checkout-email').value,
            customerPhone: document.getElementById('checkout-phone').value || undefined,
            fulfilmentMethod: document.getElementById('checkout-fulfilment').value,
            requestedDate: document.getElementById('checkout-date').value,
            requestedTime: document.getElementById('checkout-time').value,
            deliveryNotes: document.getElementById('checkout-notes').value || undefined
          };
          fetch('/api/checkout/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          .then(function(res){ return res.json(); })
          .then(function(data){
            if(data.data && data.data.clientSecret){
              var stripe = Stripe(window.STRIPE_PK);
              var overlay = document.getElementById('checkout-overlay');
              overlay.style.display = 'flex';
              var mountEl = document.getElementById('checkout-mount');
              mountEl.innerHTML = '';
              stripe.initEmbeddedCheckout({ clientSecret: data.data.clientSecret })
                .then(function(checkout){
                  stripeCheckout = checkout;
                  checkout.mount('#checkout-mount');
                  localStorage.removeItem(CART_KEY);
                  toggleCart();
                  btn.disabled = false;
                  btn.textContent = 'Pay Now';
                });
            } else {
              var msg = (data.error && data.error.message) || 'Checkout failed. Please try again.';
              alert(msg);
              btn.disabled = false;
              btn.textContent = 'Pay Now';
            }
          })
          .catch(function(){
            alert('Something went wrong. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Pay Now';
          });
        });
      }
      updateCartDisplay();
    })();
  </script>`;
}

function renderInlineCss(): string {
  return `<style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,700;1,700&family=Public+Sans:wght@300;400;600;700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--terracotta:#ec5b13;--bg:#f8f6f6;--bg-dark:#221610;--text:#1e293b;--text-muted:#64748b;--border:#e2e8f0;--max-w:72rem}
    body{font-family:'Public Sans',sans-serif;color:var(--text);background:var(--bg);line-height:1.6}
    h1,h2,h3{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:700}
    .section-title{font-size:0.75rem;font-family:'Public Sans',sans-serif;font-style:normal;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:2rem}
    nav.sticky-nav{position:sticky;top:0;z-index:50;background:rgba(248,246,246,0.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
    nav.sticky-nav a{font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:var(--text-muted);text-decoration:none;padding:1rem 0;border-bottom:2px solid transparent;transition:color 0.2s}
    nav.sticky-nav a:hover{color:var(--terracotta);border-bottom-color:var(--terracotta)}
    .nav-links{max-width:var(--max-w);margin:0 auto;padding:0 2rem;display:flex;gap:2.5rem;align-items:center;height:3.5rem;justify-content:center}
    .hero{display:flex;flex-direction:column;border-bottom:1px solid var(--border)}
    @media(min-width:768px){.hero{flex-direction:row;min-height:90vh}}
    .hero-text{flex:1;display:flex;flex-direction:column;justify-content:center;padding:3rem 2rem;background:#fff}
    @media(min-width:768px){.hero-text{padding:4rem 6rem 4rem 8rem;max-width:50%}}
    .hero-city{color:var(--terracotta);text-transform:uppercase;letter-spacing:0.3em;font-size:0.75rem;font-weight:700}
    .hero-name{font-size:clamp(3rem,7vw,6rem);line-height:0.95;margin-top:0.75rem}
    .hero-image{flex:1;min-height:50vh;background-size:cover;background-position:center;background-color:#d4c5b9}
    @media(min-width:768px){.hero-image{min-height:auto}}
    .story-section{max-width:var(--max-w);margin:0 auto;padding:5rem 2rem}
    @media(min-width:768px){.story-section{padding:6rem 8rem;display:grid;grid-template-columns:1fr 1.5fr;gap:4rem;align-items:start}}
    .story-tagline{font-size:1.75rem;border-left:3px solid var(--terracotta);padding-left:2rem;margin-bottom:2rem;font-family:'Cormorant Garamond',serif;font-style:italic;line-height:1.3}
    @media(min-width:768px){.story-tagline{margin-bottom:0;font-size:2rem}}
    .story-body{color:var(--text-muted);font-size:1.05rem;line-height:1.9}
    .fulfilment-info{max-width:var(--max-w);margin:0 auto;padding:1.5rem 2rem;display:flex;gap:1rem;flex-wrap:wrap}
    @media(min-width:768px){.fulfilment-info{padding:1.5rem 8rem}}
    .fulfilment-badge{background:var(--terracotta);color:#fff;padding:0.35rem 1rem;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em}
    .products-section{max-width:var(--max-w);margin:0 auto;padding:4rem 2rem}
    @media(min-width:768px){.products-section{padding:5rem 4rem}}
    .products-grid{display:grid;grid-template-columns:1fr;gap:1.5rem}
    @media(min-width:640px){.products-grid{grid-template-columns:repeat(2,1fr)}}
    @media(min-width:1024px){.products-grid{grid-template-columns:repeat(3,1fr);gap:2rem}}
    .product-card{border:1px solid var(--border);overflow:hidden;background:#fff;transition:box-shadow 0.2s}
    .product-card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.08)}
    .product-image{height:240px;background-size:cover;background-position:center;background-color:#e8e0d8;transition:transform 0.3s;overflow:hidden}
    @media(min-width:768px){.product-image{height:280px}}
    .product-card:hover .product-image{transform:scale(1.03)}
    .product-name{padding:1rem 1.25rem 0;font-size:1rem;font-family:'Public Sans',sans-serif;font-style:normal;font-weight:600}
    .product-description{padding:0.25rem 1.25rem;font-size:0.875rem;color:var(--text-muted)}
    .product-footer{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem}
    .product-price{font-weight:700;font-size:1.125rem}
    .add-to-cart{background:var(--terracotta);color:#fff;border:none;padding:0.5rem 1.25rem;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;transition:background 0.2s}
    .add-to-cart:hover{background:#d44f0e}
    .add-to-cart:disabled{opacity:0.5;cursor:not-allowed}
    .market-section{max-width:var(--max-w);margin:0 auto;padding:4rem 2rem;border-top:1px solid var(--border)}
    @media(min-width:768px){.market-section{padding:5rem 8rem}}
    .market-date-row{display:flex;flex-direction:column;padding:1.5rem 0;border-bottom:1px solid var(--border)}
    @media(min-width:768px){.market-date-row{flex-direction:row;justify-content:space-between;align-items:center}}
    .market-date-info{display:flex;align-items:center;gap:1rem}
    .market-date-dot{width:10px;height:10px;border-radius:50%;background:var(--terracotta);flex-shrink:0}
    .market-date-value{font-size:1.5rem;font-family:'Cormorant Garamond',serif;font-style:italic}
    .market-date-details{margin-top:0.5rem}
    @media(min-width:768px){.market-date-details{margin-top:0;text-align:right}}
    .market-name{font-weight:700}
    .market-location,.market-address{font-size:0.875rem;color:var(--text-muted)}
    .schedule-section{max-width:var(--max-w);margin:0 auto;padding:4rem 2rem}
    @media(min-width:768px){.schedule-section{padding:5rem 8rem}}
    .schedule-slot{display:flex;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--border)}
    .schedule-day{font-weight:600}
    .schedule-time{color:var(--text-muted)}
    .quote-section{max-width:var(--max-w);margin:0 auto;padding:4rem 2rem;border-top:1px solid var(--border);text-align:center}
    @media(min-width:768px){.quote-section{padding:5rem 8rem}}
    .quote-form{display:flex;flex-direction:column;gap:1rem;max-width:32rem;margin:0 auto;text-align:left}
    .quote-form input,.quote-form select,.quote-form textarea{padding:0.75rem;border:1px solid var(--border);font-family:'Public Sans',sans-serif;font-size:1rem;background:#fff}
    .quote-form input:focus,.quote-form select:focus,.quote-form textarea:focus{outline:2px solid var(--terracotta);outline-offset:-1px;border-color:var(--terracotta)}
    .quote-submit{background:var(--terracotta);color:#fff;border:none;padding:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;transition:background 0.2s}
    .quote-submit:hover{background:#d44f0e}
    .more-in-city{text-align:center;padding:4rem 2rem;background:#fff;border-top:1px solid var(--border);font-size:1.05rem}
    footer{text-align:center;padding:3rem 2rem;font-size:0.875rem;color:var(--text-muted);border-top:1px solid var(--border)}
    .mobile-bottom-nav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--border);z-index:40;padding:0.5rem}
    .mobile-bottom-nav a,.mobile-bottom-nav button{flex:1;text-align:center;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;text-decoration:none;color:var(--text);padding:0.5rem 0;background:none;border:none;cursor:pointer;font-family:'Public Sans',sans-serif}
    @media(min-width:768px){.mobile-bottom-nav{display:none}}
    .cart-drawer[aria-hidden="true"]{display:none}
    .cart-drawer{position:fixed;inset:0;z-index:100;display:flex;justify-content:flex-end}
    .cart-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.4)}
    .cart-panel{position:relative;width:100%;max-width:28rem;background:#fff;overflow-y:auto;padding:2rem;display:flex;flex-direction:column;gap:1rem;box-shadow:-4px 0 24px rgba(0,0,0,0.1)}
    .cart-header{display:flex;justify-content:space-between;align-items:center}
    .cart-header h2{font-size:1.25rem}
    .cart-close{background:none;border:none;font-size:1.5rem;cursor:pointer}
    .cart-item{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border)}
    .cart-summary{border-top:2px solid var(--border);padding-top:1rem;display:flex;flex-direction:column;gap:0.5rem}
    .cart-total{font-weight:700;display:flex;justify-content:space-between}
    .cart-subtotal,.cart-delivery-fee{display:flex;justify-content:space-between;color:var(--text-muted)}
    .checkout-form{display:flex;flex-direction:column;gap:0.75rem;border-top:1px solid var(--border);padding-top:1rem}
    .checkout-form h3{font-size:1rem;font-family:'Public Sans',sans-serif;font-style:normal;font-weight:700}
    .checkout-form label{font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
    .checkout-form input,.checkout-form select,.checkout-form textarea{padding:0.5rem;border:1px solid var(--border);font-family:'Public Sans',sans-serif}
    .checkout-form input:focus,.checkout-form select:focus,.checkout-form textarea:focus{outline:2px solid var(--terracotta);outline-offset:-1px;border-color:var(--terracotta)}
    .checkout-button{background:var(--terracotta);color:#fff;border:none;padding:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;transition:background 0.2s}
    .checkout-button:hover{background:#d44f0e}
    .checkout-overlay{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center}
    .checkout-overlay-bg{position:absolute;inset:0;background:rgba(0,0,0,0.5)}
    .checkout-overlay-panel{position:relative;background:#fff;border-radius:0.5rem;width:95%;max-width:32rem;max-height:90vh;overflow-y:auto;padding:1.5rem;box-shadow:0 25px 50px rgba(0,0,0,0.25)}
    .checkout-overlay-close{position:absolute;top:0.5rem;right:0.75rem;background:none;border:none;font-size:1.5rem;cursor:pointer;z-index:1}
  </style>`;
}

export function renderHtmlTemplate(input: RenderHtmlTemplateInput): string {
  const { tenant, seoMetadata, assetsBaseUrl } = input;

  const heroImageUrl = `${assetsBaseUrl}/${tenant.primaryPhotoKey}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(seoMetadata.title)}</title>
    <meta name="description" content="${escapeHtml(seoMetadata.description)}" />
    <link rel="canonical" href="${escapeHtml(seoMetadata.canonicalUrl)}" />
    ${renderOgTags(seoMetadata.ogTags)}
    ${renderJsonLd(seoMetadata.jsonLd as Record<string, unknown>)}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    ${renderInlineCss()}
</head>
<body>
  <section class="hero">
    <div class="hero-text">
      <p class="hero-city">${escapeHtml(tenant.city)}</p>
      <h1 class="hero-name">${escapeHtml(tenant.name)}</h1>
    </div>
    <div class="hero-image" style="background-image:url('${escapeHtml(heroImageUrl)}')" role="img" aria-label="${escapeHtml(tenant.name)}"></div>
  </section>
  <nav class="sticky-nav">
    <div class="nav-links">
      <a href="#about">About</a>
      <a href="#products">Products</a>
      <a href="#market-dates">Markets</a>
      <a href="#book-event">Events</a>
    </div>
  </nav>
  <section id="about" class="story-section">
    <blockquote class="story-tagline">${escapeHtml(tenant.tagline)}</blockquote>
    <p class="story-body">${escapeHtml(tenant.story)}</p>
  </section>
  ${renderDeliveryInfo(tenant)}
  ${renderProductsSection(tenant.products, assetsBaseUrl, tenant.stripeOnboardingComplete)}
  ${renderMarketCalendar(tenant.marketDates)}
  ${renderOperationalSchedule(tenant.operationalSchedule)}
  ${renderQuoteForm()}
  ${renderMoreInCity(tenant)}
  <footer>
    <p>&copy; ${escapeHtml(tenant.name)} &middot; ${escapeHtml(tenant.city)}, ${escapeHtml(tenant.country)}</p>
  </footer>
  ${renderMobileBottomNav()}
  ${renderCartDrawer(tenant)}
  <div id="checkout-overlay" class="checkout-overlay" style="display:none">
    <div class="checkout-overlay-bg" onclick="closeCheckout()"></div>
    <div class="checkout-overlay-panel">
      <button class="checkout-overlay-close" onclick="closeCheckout()" aria-label="Close checkout">&times;</button>
      <div id="checkout-mount"></div>
    </div>
  </div>
  <script>window.VENDOR_SLUG='${escapeHtml(tenant.vendorSlug)}';window.STRIPE_PK='${escapeHtml(process.env.STRIPE_PUBLISHABLE_KEY ?? '')}';</script>
  <script src="https://js.stripe.com/v3/"></script>
  ${renderCartScript()}
</body>
</html>`;
}

export function render404Page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Not Found | Dmercato</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Public Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f6f6;color:#1e293b}
      .error-container{text-align:center;padding:2rem}
      h1{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:6rem;color:#ec5b13;line-height:1}
      p{margin-top:1rem;color:#64748b;font-size:1.125rem}
      a{color:#ec5b13;text-decoration:none;font-weight:700}
    </style>
</head>
<body>
  <div class="error-container">
    <h1>404</h1>
    <p>This vendor page could not be found.</p>
    <p><a href="/">Back to Dmercato</a></p>
  </div>
</body>
</html>`;
}

export function render500Page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Error | Dmercato</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Public Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f6f6;color:#1e293b}
      .error-container{text-align:center;padding:2rem}
      h1{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:6rem;color:#ec5b13;line-height:1}
      p{margin-top:1rem;color:#64748b;font-size:1.125rem}
    </style>
</head>
<body>
  <div class="error-container">
    <h1>500</h1>
    <p>Something went wrong. Please try again later.</p>
  </div>
</body>
</html>`;
}
