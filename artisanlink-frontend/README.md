# ArtisanLink — Frontend (HTML, CSS, JavaScript)

Static website for the ArtisanLink Cloud Computing project. No build step, no frameworks.

## Files

```
index.html       Landing page: choose "I need an artisan" or "I am an artisan"
customer.html    Customer: sign in → choose trade, describe job, area, urgency → pick artisan → request → track → rate
artisan.html     Artisan: register / sign in → go online/offline → accept/decline → mark complete → history
css/styles.css   All styling (mobile-first)
js/config.js     API URL, list of trades, Ghana area coordinates
js/api.js        The ONLY file that talks to the backend (demo mode + live mode)
js/common.js     Shared helpers (session, distance, toast, phone validation)
js/customer.js   Customer page logic
js/artisan.js    Artisan page logic
```

## Run it locally

Open a terminal in this folder and run:

```
python -m http.server 8000
```

Then visit http://localhost:8000. (Opening index.html by double-click also works in most browsers.)

**Demo mode** is on while `API_BASE_URL` in `js/config.js` is empty. Data is saved in the browser
(localStorage), with 11 sample artisans. To demo both sides, open `artisan.html` in one tab and
`customer.html` in another tab of the **same browser**. Sample artisans auto-accept requests after ~5 seconds.

## Connect to the backend (Week 10)

1. Deploy API Gateway + Lambda + DynamoDB.
2. Paste the API Gateway invoke URL into `js/config.js`:
   `API_BASE_URL: "https://xxxx.execute-api.af-south-1.amazonaws.com/prod"`
3. Enable **CORS** on every API Gateway route (allow your S3/CloudFront origin, methods GET/POST/PATCH/OPTIONS,
   header `Content-Type, Authorization`).

Routes the Lambda functions must provide (full list at the top of `js/api.js`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/artisans?trade=&lat=&lng=` | Nearby artisans, available first (add `distanceKm`) |
| GET | `/artisans?phone=` | Find artisan by phone (sign in) |
| POST | `/artisans` | Register artisan |
| GET / PATCH | `/artisans/{artisanId}` | Get profile / set `status` (available, busy, offline) |
| POST | `/requests` | Create request |
| GET | `/requests?customerPhone=` or `?artisanId=` | List requests |
| PATCH | `/requests/{requestId}` | Set `status` (accepted, declined, completed, cancelled) |
| POST | `/reviews` | Save rating and comment |

DynamoDB field names used by the frontend:
- **Artisans**: artisanId, name, phone, trade, area, lat, lng, status, rating, jobs, verified
- **Requests**: requestId, artisanId, artisanName, artisanPhone, trade, customerName, customerPhone, description, urgency, area, address, lat, lng, status, rating, createdAt, updatedAt (epoch ms)
- **Reviews**: reviewId, requestId, artisanId, rating, comment, createdAt

Later: replace the simple name/phone sign-in with Amazon Cognito. `api.js` already sends
`Session.get().idToken` as the `Authorization` header when one exists.

## Deploy to Amazon S3 (af-south-1)

```
aws s3 mb s3://artisanlink-site-<yourname> --region af-south-1
aws s3 sync . s3://artisanlink-site-<yourname> --exclude "README.md"
```

Then in the bucket: **Properties → Static website hosting → Enable**, index document `index.html`.
For HTTPS, put CloudFront in front of the bucket (recommended, as on the compliance slide).

Teardown after finals: `aws s3 rb s3://artisanlink-site-<yourname> --force`
