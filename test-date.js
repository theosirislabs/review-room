const parseCustomDate = (dateStr, timeStr) => {
    try {
        const [year, month, day] = dateStr.split('-');
        let [time, modifier] = timeStr.trim().split(' ');
        let [hours, minutes] = time.split(':');
        
        if (hours === '12') hours = '00';
        if (modifier && modifier.toUpperCase() === 'PM') {
            hours = parseInt(hours, 10) + 12;
        }
        
        return new Date(`${year}-${month}-${day}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00Z`).getTime();
    } catch {
        return new Date(dateStr).getTime();
    }
};
console.log(parseCustomDate('2026-02-17', '12:00 PM'));
