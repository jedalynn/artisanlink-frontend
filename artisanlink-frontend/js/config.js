// ArtisanLink — frontend configuration
// Leave API_BASE_URL empty to run in DEMO mode (data kept in this browser only).
// When the API Gateway stage is deployed, paste its invoke URL here, e.g.
//   "https://abc123.execute-api.af-south-1.amazonaws.com/prod"
const CONFIG = {
  API_BASE_URL: "",
  TRADES: ["Plumber", "Electrician", "Carpenter", "Tailor", "Mason", "Painter", "Mechanic", "AC Technician"],
  // Approximate centre points used when the browser can't share GPS location
  AREAS: {
    "Accra Central": [5.5502, -0.2174],
    "Osu": [5.5560, -0.1820],
    "East Legon": [5.6370, -0.1610],
    "Madina": [5.6830, -0.1660],
    "Dansoman": [5.5390, -0.2660],
    "Achimota": [5.6150, -0.2330],
    "Tema": [5.6690, -0.0170],
    "Kasoa": [5.5340, -0.4170],
    "Kumasi": [6.6885, -1.6244],
    "Takoradi": [4.8980, -1.7600]
  }
};
