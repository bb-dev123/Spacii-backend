// Helper function to normalize time format to HH:MM (24-hour format)
export function normalizeTimeFormat(time: string): string {
  const [hours, minutes] = time.split(':').map(part => part.trim());
  const paddedHours = hours.padStart(2, '0');
  return `${paddedHours}:${minutes}`;
}

// Helper function to convert HH:MM time to minutes since midnight
export function convertTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function parseCustomDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Month is 0-indexed in JavaScript Date
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}


export function timeStringToMinutes(timeStr: string): number {
  // Handle 24-hour format like '04:15', '23:00'
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const match = timeStr.match(timeRegex);

  if (!match) {
    throw new Error(
      `Invalid time format: ${timeStr}, expected 24-hour format like "04:15" or "23:00"`
    );
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  return hours * 60 + minutes;
}

export function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Format as 24-hour time with leading zeros for both hours and minutes
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
