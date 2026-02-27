export function haversineM(aLat,aLng,bLat,bLng){
  const R = 6371000;
  const toRad = d => d*Math.PI/180;
  const dLat = toRad(bLat-aLat), dLng = toRad(bLng-aLng);
  const sa = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(sa));
}

export function watchPosition(onUpdate, onError){
  if(!("geolocation" in navigator)){
    onError?.(new Error("Geolocation not supported"));
    return null;
  }
  const id = navigator.geolocation.watchPosition(
    (p)=>onUpdate(p),
    (e)=>onError?.(e),
    { enableHighAccuracy:true, maximumAge:3000, timeout:15000 }
  );
  return ()=>navigator.geolocation.clearWatch(id);
}