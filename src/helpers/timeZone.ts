import axios from "axios";
import { DateTime } from "luxon";

// Option 1: Using Google Maps Timezone API (Recommended)
export const getTimezoneFromGoogle = async (
  lat: number,
  lng: number
): Promise<string> => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );

    if (response.data.status === "OK") {
      return response.data.timeZoneId;
    } else {
      throw new Error(`Google Timezone API error: ${response.data.status}`);
    }
  } catch (error) {
    console.error("Error fetching timezone from Google:", error);
    throw new Error("Failed to fetch timezone from Google API");
  }
};

// Option 2: Using TimeZoneDB API (Alternative)
export const getTimezoneFromTimeZoneDB = async (
  lat: number,
  lng: number
): Promise<string> => {
  try {
    const response = await axios.get(
      `http://api.timezonedb.com/v2.1/get-time-zone?key=${process.env.TIMEZONEDB_API_KEY}&format=json&by=position&lat=${lat}&lng=${lng}`
    );

    if (response.data.status === "OK") {
      return response.data.zoneName;
    } else {
      throw new Error(`TimeZoneDB API error: ${response.data.message}`);
    }
  } catch (error) {
    console.error("Error fetching timezone from TimeZoneDB:", error);
    throw new Error("Failed to fetch timezone from TimeZoneDB API");
  }
};

// Option 3: Using GeoNames API (Free alternative)
export const getTimezoneFromGeoNames = async (
  lat: number,
  lng: number
): Promise<string> => {
  try {
    const response = await axios.get(
      `http://api.geonames.org/timezoneJSON?lat=${lat}&lng=${lng}&username=${process.env.GEONAMES_USERNAME}`
    );

    if (response.data.timezoneId) {
      return response.data.timezoneId;
    } else {
      throw new Error("GeoNames API: No timezone found");
    }
  } catch (error) {
    console.error("Error fetching timezone from GeoNames:", error);
    throw new Error("Failed to fetch timezone from GeoNames API");
  }
};

// Main function that tries multiple services with fallback
export const getTimezoneFromLocation = async (
  lat: number,
  lng: number
): Promise<string> => {
  // Try Google first (most reliable)
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      return await getTimezoneFromGoogle(lat, lng);
    } catch (error) {
      console.warn("Google timezone lookup failed, trying fallback");
    }
  }

  // Try TimeZoneDB as fallback
  if (process.env.TIMEZONEDB_API_KEY) {
    try {
      return await getTimezoneFromTimeZoneDB(lat, lng);
    } catch (error) {
      console.warn("TimeZoneDB timezone lookup failed, trying GeoNames");
    }
  }

  // Try GeoNames as last resort (free but requires registration)
  if (process.env.GEONAMES_USERNAME) {
    try {
      return await getTimezoneFromGeoNames(lat, lng);
    } catch (error) {
      console.warn("GeoNames timezone lookup failed");
    }
  }

  // If all services fail, return a default timezone
  console.error("All timezone lookup services failed, using UTC as default");
  return "UTC";
};

export const isValidTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
};

// Parse custom date + time into a DateTime in the spot's timezone
export function parseCustomDateTime(date: string, time: string, timeZone: string): DateTime {
  return DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', { zone: timeZone });
}
