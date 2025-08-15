import axios from "axios";

export const getLocationFromAddress = async (
  address: string
): Promise<{ lat: number; lng: number } | null> => {
  try {
    // Clean up the address
    const cleanAddress = address.trim();

    console.log(`Attempting to geocode: "${cleanAddress}"`);

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          address: cleanAddress,
          key:
            process.env.GOOGLE_MAPS_API_KEY ||
            "AIzaSyAjan5owKZSB60tX6FGt-7KhbCzBwROlR0",
        },
        timeout: 10000, // 10 second timeout
      }
    );

    console.log(`Geocoding response status: ${response.data.status}`);
    console.log(`Geocoding response:`, JSON.stringify(response.data, null, 2));

    // Check for different status codes and handle them appropriately
    switch (response.data.status) {
      case "OK":
        if (response.data.results && response.data.results.length > 0) {
          const location = response.data.results[0].geometry.location;
          console.log(`Successfully geocoded "${cleanAddress}":`, {
            lat: location.lat,
            lng: location.lng,
          });
          return { lat: location.lat, lng: location.lng };
        }
        console.warn(`No results found for address: "${cleanAddress}"`);
        return null;

      case "ZERO_RESULTS":
        console.warn(`No results found for address: "${cleanAddress}"`);
        return null;

      case "OVER_QUERY_LIMIT":
        console.error(`Over query limit for Google Maps API`);
        return null;

      case "REQUEST_DENIED":
        console.error(
          `Request denied by Google Maps API. Check your API key and permissions.`
        );
        return null;

      case "INVALID_REQUEST":
        console.error(`Invalid request for address: "${cleanAddress}"`);
        return null;

      case "UNKNOWN_ERROR":
        console.error(
          `Unknown error occurred while geocoding: "${cleanAddress}"`
        );
        return null;

      default:
        console.error(
          `Unexpected status: ${response.data.status} for address: "${cleanAddress}"`
        );
        return null;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error:", {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      console.error("Geocoding error:", error);
    }
    return null;
  }
};

export const getLocationWithMultipleFormats = async (
  city: string,
  country: string
): Promise<{ lat: number; lng: number } | null> => {
  const addressFormats = [
    `${city}, ${country}`,
    `${city} ${country}`,
    city, // Try just the city name
    country, // Fallback to country if city fails
  ];

  for (const address of addressFormats) {
    console.log(`Trying address format: "${address}"`);
    const result = await getLocationFromAddress(address);
    if (result) {
      console.log(`Success with format: "${address}"`);
      return result;
    }
  }

  console.warn(
    `All address formats failed for city: "${city}", country: "${country}"`
  );
  return null;
};
