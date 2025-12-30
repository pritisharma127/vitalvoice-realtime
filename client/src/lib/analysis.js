// Simple local analysis engine

const POSITIVE_WORDS = new Set([
    'good', 'great', 'awesome', 'amazing', 'excellent', 'happy', 'love', 'wonderful',
    'fantastic', 'perfect', 'thanks', 'thank', 'glad', 'excited', 'cool', 'nice',
    'yes', 'sure', 'correct', 'right', 'understand'
]);

const NEGATIVE_WORDS = new Set([
    'bad', 'terrible', 'awful', 'horrible', 'sad', 'hate', 'wrong', 'incorrect',
    'wait', 'stop', 'no', 'not', 'never', 'problem', 'issue', 'error', 'failed',
    'confused', 'sorry', 'concern', 'difficult', 'frustrated', 'frustrating', 'angry',
    'upset', 'mad', 'disappointed', 'annoyed', 'useless', 'stupid', 'broken'
]);

const COMMON_WORDS = new Set([
    'hello', 'hi', 'how', 'what', 'why', 'where', 'when', 'who', 'could', 'would', 'should',
    'the', 'and', 'but', 'can', 'cant', 'cannot', 'please', 'thanks', 'thank', 'you', 'your',
    'this', 'that', 'there', 'their', 'they', 'have', 'been', 'with', 'from', 'about'
]);

export function analyzeSentiment(text) {
    if (!text) return 'neutral';

    const tokens = text.toLowerCase().split(/\s+/);
    let score = 0;

    tokens.forEach(token => {
        const clean = token.replace(/[^a-z]/g, '');
        if (POSITIVE_WORDS.has(clean)) score += 1;
        if (NEGATIVE_WORDS.has(clean)) score -= 1;
    });

    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
}

export function extractEntities(text) {
    if (!text) return [];

    const entities = [];

    // Dates
    const dateRegex = /\b(\d{4}-\d{2}-\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
    let match;
    while ((match = dateRegex.exec(text)) !== null) {
        entities.push({ type: 'date', value: match[0], index: match.index });
    }

    // Numbers & Currency
    const numRegex = /\b(\d+(?:\.\d+)?|\$\d+)\b/g;
    while ((match = numRegex.exec(text)) !== null) {
        if (!entities.some(e => Math.abs(e.index - match.index) < 5)) {
            entities.push({ type: 'number', value: match[0], index: match.index });
        }
    }

    // Phone Numbers (Improved for Indian/Global)
    const phoneRegex = /\b(?:\+?91|0)?[-\s]?([6-9]\d{9}|[2-9]\d{2}[-\s]?\d{3}[-\s]?\d{4})\b/g;
    while ((match = phoneRegex.exec(text)) !== null) {
        entities.push({ type: 'phone', value: match[0], index: match.index });
    }

    // --- NEW: Blood Group Detection ---
    const bloodRegex = /\b([ABOabopn]{1,2}[+-]|O-pos|O-neg|A-pos|A-neg|B-pos|B-neg|AB-pos|AB-neg)\b/gi;
    while ((match = bloodRegex.exec(text)) !== null) {
        entities.push({ type: 'blood_group', value: match[0].toUpperCase(), index: match.index });
    }

    // Proper Nouns (Names/Products - capitalized words)
    // improved to catch multiple words "iPhone 15"
    const nameRegex = /(?:\s|^)([A-Z][a-zA-Z0-9]+(?: [A-Z][a-zA-Z0-9]+)*)\b/g;
    while ((match = nameRegex.exec(text)) !== null) {
        const val = match[1];
        const lower = val.toLowerCase();
        if (
            !POSITIVE_WORDS.has(lower) &&
            !NEGATIVE_WORDS.has(lower) &&
            !COMMON_WORDS.has(lower) &&
            val.length > 2
        ) {
            entities.push({ type: 'name/product', value: val, index: match.index });
        }
    }

    // --- NEW: Medical Conditions / Risks ---
    const medicalKeywords = [
        'fever', 'flu', 'cold', 'cough', 'medicine', 'medication', 'surgery', 'diabetes',
        'sugar', 'pressure', 'bp', 'heart', 'asthma', 'allergy', 'pregnant', 'period', 'tattoo',
        'alcohol', 'smoking', 'cancer', 'hiv', 'malaria', 'dengue', 'health'
    ];
    medicalKeywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        if (regex.test(text)) {
            entities.push({ type: 'medical', value: keyword.toUpperCase(), index: 0 });
        }
    });

    // --- NEW: Location / Pincode Detection ---
    // Indian Zip/Pin codes are 6 digits
    const pinRegex = /\b\d{6}\b/g;
    while ((match = pinRegex.exec(text)) !== null) {
        entities.push({ type: 'zipcode', value: match[0], index: match.index });
    }

    // Address Keywords (simple heuristic)
    const addressKeywords = ['near', 'behind', 'street', 'road', 'layout', 'nagar', 'cross', 'main', 'floor', 'house', 'apartment', 'area', 'kadubessanahlli', 'hennur', 'whitefield', 'hospital', 'colony', 'apartment', 'society'];
    addressKeywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        if (regex.test(text)) {
            // If the text contains capitalized words and address markers, tag it as location
            if (/[A-Z]/.test(text) && text.length > 5) {
                if (!entities.some(e => e.value === text)) {
                    entities.push({ type: 'location', value: text, index: 0 });
                }
            }
        }
    });

    // --- NEW: Availability Detection ---
    const intent = analyzeIntent(text);
    if (intent === 'Donation Confirmed') {
        entities.push({ type: 'availability', value: 'READY TO DONATE', index: 0 });
    } else if (intent === 'Donation Rejected') {
        entities.push({ type: 'availability', value: 'UNAVAILABLE', index: 0 });
    }

    // --- NEW: Age / Weight Detection ---
    const ageRegex = /\b(\d{1,2})\s?(?:yrs|years old|age|age is)\b/gi;
    while ((match = ageRegex.exec(text)) !== null) {
        entities.push({ type: 'age', value: match[1] + " YRS", index: match.index });
    }
    const weightRegex = /\b(\d{2,3})\s?(?:kg|kilos|weight)\b/gi;
    while ((match = weightRegex.exec(text)) !== null) {
        entities.push({ type: 'weight', value: match[1] + " KG", index: match.index });
    }

    return entities;
}

export function analyzeIntent(text) {
    const t = text.toLowerCase();

    // Blood Donation Specifics
    if ((t.includes('yes') || t.includes('sure') || t.includes('ready') || t.includes('confirm')) &&
        (t.includes('today') || t.includes('now') || t.includes('coming'))) return 'Donation Confirmed';

    if (t.includes('cannot') || t.includes('unable') || t.includes('busy') || t.includes('next time') || t.includes('not ready')) return 'Donation Rejected';

    if (t.includes('buy') || t.includes('purchase') || t.includes('order') || t.includes('price') || t.includes('cost')) return 'Purchase/Inquiry';
    if (t.includes('help') || t.includes('support') || t.includes('issue') || t.includes('problem') || t.includes('broken')) return 'Support/Complaint';
    if (t.includes('return') || t.includes('refund')) return 'Return/Refund';
    if (t.includes('schedule') || t.includes('appointment') || t.includes('book')) return 'Scheduling';

    return 'General';
}

