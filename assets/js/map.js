export function initMap(){
  const map = L.map("map", { zoomControl:false }).setView([50.7698,15.0589], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap"
  }).addTo(map);
  return map;
}

export function makeMarker(map, lat, lng, label){
  const m = L.marker([lat,lng]).addTo(map);
  if(label) m.bindPopup(label);
  return m;
}