// src/utils/content.ts
import { aiService } from '../services/ai/ai.js';
export class ContentUtils {
    static templates = {
        price_update: {
            type: 'market_update',
            template: "🚀 $MEME Price Update:\n${price} ${currency}\n24h Change: ${change}%\nVolume: ${volume}\n\n${sentiment} ${hashtags}",
            variables: ['price', 'currency', 'change', 'volume', 'sentiment', 'hashtags']
        },
        community_milestone: {
            type: 'community',
            template: "🎉 Amazing $MEME community!\nWe just hit ${milestone} ${metric}!\nLFG! ${hashtags}",
            variables: ['milestone', 'metric', 'hashtags']
        },
        meme_template: {
            type: 'meme',
            template: "${meme_text}\n\n${hashtags}",
            variables: ['meme_text', 'hashtags']
        }
    };
    static emojis = {
        bullish: ['🚀', '📈', '💎', '🌙', '💪'],
        bearish: ['📉', '😅', '💫', '🎢', '🔄'],
        neutral: ['👀', '🤔', '📊', '💡', '🎯']
    };
    static hashtags = {
        default: ['#Solana', '#Crypto', '#Web3'],
        bullish: ['#ToTheMoon', '#WAGMI', '#BullMarket'],
        bearish: ['#HODL', '#DiamondHands', '#BuyTheDip'],
        community: ['#CryptoFamily', '#CryptoCommunity']
    };
    /**
     * Generate content based on type and parameters
     */
    static async generateContent(params) {
        try {
            const template = this.templates[params.type];
            if (!template) {
                throw new Error(`Unknown content type: ${params.type}`);
            }
            // Get AI-generated content if needed
            let aiContent = '';
            if (params.type === 'meme') {
                if (!aiService) {
                    throw new Error('AI service is not initialized');
                }
                const memeResponse = await aiService.generateMemeContent();
                aiContent = memeResponse.text;
            }
            // Process template variables
            let content = template.template;
            const variables = params.variables || {};
            // Replace template variables
            for (const key of template.variables) {
                const value = variables[key] || this.getDefaultValue(key, params.sentiment);
                content = content.replace(`\${${key}}`, value.toString());
            }
            // Add AI-generated content if any
            if (aiContent) {
                content = content.replace('${meme_text}', aiContent);
            }
            // Format for platform
            return this.formatForPlatform(content, params.platform);
        }
        catch (error) {
            console.error('Error generating content:', error);
            throw error;
        }
    }
    /**
     * Format content for specific platform
     */
    static formatForPlatform(content, platform) {
        if (platform === 'twitter') {
            // Ensure content meets Twitter's requirements
            if (content.length > 280) {
                content = content.substring(0, 277) + '...';
            }
        }
        return content;
    }
    /**
     * Get random emojis based on sentiment
     */
    static getRandomEmojis(sentiment = 'neutral', count = 2) {
        const emojiList = this.emojis[sentiment === 'positive' ? 'bullish' : sentiment === 'negative' ? 'bearish' : 'neutral'];
        return this.shuffleArray(emojiList).slice(0, count);
    }
    /**
     * Get relevant hashtags
     */
    static getHashtags(sentiment) {
        const defaultTags = this.hashtags.default;
        const sentimentTags = sentiment ?
            this.hashtags[sentiment === 'positive' ? 'bullish' : sentiment === 'negative' ? 'bearish' : 'community']
            : [];
        return [...defaultTags, ...this.shuffleArray(sentimentTags).slice(0, 2)];
    }
    /**
     * Format numbers for display
     */
    static formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    /**
     * Format percentages
     */
    static formatPercentage(num) {
        const formatted = num.toFixed(2);
        return num > 0 ? `+${formatted}%` : `${formatted}%`;
    }
    // Private helper methods
    static getDefaultValue(key, sentiment) {
        switch (key) {
            case 'hashtags':
                return this.getHashtags(sentiment).join(' ');
            case 'sentiment':
                return this.getRandomEmojis(sentiment).join(' ');
            default:
                return '';
        }
    }
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}
// Example usage
async function example() {
    // Generate price update content
    const priceUpdate = await ContentUtils.generateContent({
        type: 'market_update',
        variables: {
            price: '1.23',
            currency: 'USD',
            change: '+5.67',
            volume: '1.5M'
        },
        sentiment: 'positive',
        platform: 'twitter'
    });
    // Generate meme content
    const memeContent = await ContentUtils.generateContent({
        type: 'meme',
        sentiment: 'positive',
        platform: 'discord'
    });
    console.log('Price Update:', priceUpdate);
    console.log('Meme Content:', memeContent);
}
export default ContentUtils;
