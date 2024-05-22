const axios = require('axios');
const PriorityQueue = require('js-priority-queue');

const WEATHER_API_KEY = 'OPENWEATHER API KEY';
const ADSB_API_KEY = 'ADSB API KEY';

class Node {
  constructor(lat, lon, alt) {
    this.latitude = lat;
    this.longitude = lon;
    this.altitude = alt;
    this.weather = null; 
    this.airTraffic = null;  
    this.distance = Infinity; 
    this.previous = null;  
    this.edges = [];  
  }

  updateWeather(weatherData) {
    this.weather = weatherData;
  }

  updateAirTraffic(trafficData) {
    this.airTraffic = trafficData;
  }

  addEdge(neighbor, weight) {
    this.edges.push({ node: neighbor, weight: weight });
  }

  displayInfo() {
    console.log(`Node (Lat: ${this.latitude}, Lon: ${this.longitude}, Alt: ${this.altitude})`);
    console.log(`  Weather: ${JSON.stringify(this.weather)}`);
    console.log(`  Air Traffic: ${JSON.stringify(this.airTraffic)}`);
  }
}

async function fetchSurfaceWeatherData(lat, lon) {
  const url = `http://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch weather data for coordinates (${lat}, ${lon}): ${error}`);
    return null;
  }
}

function calculateWeatherAtAltitude(surfaceWeather, altitude) {
  const lapseRate = 6.5 / 1000;  
  const R = 287.05;  
  const g = 9.80665;  
  const M = 0.0289644;  

  const surfaceTemp = surfaceWeather.main.temp - 273.15;  
  const surfacePressure = surfaceWeather.main.pressure * 100;  
  const surfaceHumidity = surfaceWeather.main.humidity;  

  const tempAtAltitude = surfaceTemp - lapseRate * altitude;
  const tempAtAltitudeK = tempAtAltitude + 273.15;  

  const pressureAtAltitude = surfacePressure * Math.exp((-g * M * altitude) / (R * (surfaceTemp + tempAtAltitudeK) / 2));

  const humidityAtAltitude = surfaceHumidity - (altitude / 1000) * 5;
  const humidityAtAltitudeClamped = Math.max(0, Math.min(100, humidityAtAltitude));  

  const windSpeedAtAltitude = surfaceWeather.wind.speed + (altitude / 1000) * 2;  
  const windDirectionAtAltitude = surfaceWeather.wind.deg;  

  const cloudCoverAtAltitude = surfaceWeather.clouds.all - (altitude / 1000) * 10;
  const cloudCoverAtAltitudeClamped = Math.max(0, Math.min(100, cloudCoverAtAltitude));  

  const visibilityAtAltitude = surfaceWeather.visibility + (altitude / 1000) * 1000;  
  return {
    temp: tempAtAltitudeK,
    pressure: pressureAtAltitude / 100,  
    humidity: humidityAtAltitudeClamped,
    windSpeed: windSpeedAtAltitude,
    windDirection: windDirectionAtAltitude,
    cloudCover: cloudCoverAtAltitudeClamped,
    visibility: visibilityAtAltitude
  };
}

async function fetchAirTrafficData(lat, lon, radius = 50) {
  const url = `https://adsbexchange.com/api/aircraft/json/lat/${lat}/lon/${lon}/dist/${radius}/?key=${ADSB_API_KEY}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch air traffic data for coordinates (${lat}, ${lon}): ${error}`);
    return null;
  }
}

async function initializeGrid(latRange, lonRange, altRange, cellSize) {
  const grid = [];
  for (let lat = latRange.min; lat <= latRange.max; lat += cellSize) {
    const latLayer = [];
    for (let lon = lonRange.min; lon <= lonRange.max; lon += cellSize) {
      const lonLayer = [];
      for (let alt = altRange.min; alt <= altRange.max; alt += cellSize) {
        const node = new Node(lat, lon, alt);
        const surfaceWeather = await fetchSurfaceWeatherData(lat, lon);
        if (surfaceWeather) {
          const weatherAtAltitude = calculateWeatherAtAltitude(surfaceWeather, alt * 1000);  // Convert km to meters
          node.updateWeather(weatherAtAltitude);
        }
        const airTraffic = await fetchAirTrafficData(lat, lon);
        if (airTraffic) {
          node.updateAirTraffic(airTraffic);
        }
        lonLayer.push(node);
      }
      latLayer.push(lonLayer);
    }
    grid.push(latLayer);
  }

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      for (let k = 0; k < grid[i][j].length; k++) {
        const node = grid[i][j][k];
        if (i > 0) node.addEdge(grid[i-1][j][k], Math.random());
        if (i < grid.length - 1) node.addEdge(grid[i+1][j][k], Math.random());
        if (j > 0) node.addEdge(grid[i][j-1][k], Math.random());
        if (j < grid[i].length - 1) node.addEdge(grid[i][j+1][k], Math.random());
        if (k > 0) node.addEdge(grid[i][j][k-1], Math.random());
        if (k < grid[i][j].length - 1) node.addEdge(grid[i][j][k+1], Math.random());
      }
    }
  }

  return grid;
}

function dijkstra(grid, source, destination) {
  const queue = new PriorityQueue({ comparator: (a, b) => a.distance - b.distance });
  source.distance = 0;
  queue.queue(source);

  while (queue.length > 0) {
    const current = queue.dequeue();

    if (current === destination) {
      break;
    }

    current.edges.forEach(edge => {
      const neighbor = edge.node;
      const weight = edge.weight;
      const altDistance = current.distance + weight;

      if (altDistance < neighbor.distance) {
        neighbor.distance = altDistance;
        neighbor.previous = current;
        queue.queue(neighbor);
      }
    });
  }

  const path = [];
  let currentNode = destination;
  while (currentNode) {
    path.unshift(currentNode);
    currentNode = currentNode.previous;
  }

  return path;
}

const latRange = { min: 0, max: 10 };  
const lonRange = { min: 0, max: 10 };  
const altRange = { min: 0, max: 5 };  


const cellSize = 1;

initializeGrid(latRange, lonRange, altRange, cellSize).then(grid => {
  const source = grid[0][0][0];
  const destination = grid[10][10][5];

  const path = dijkstra(grid, source, destination);

  path.forEach(node => node.displayInfo());
});

