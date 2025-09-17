const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField } = require('discord.js');
const { db, sql, reviews, settings, initDatabase, getSettings, updateSettings, saveReview } = require('./database');

// Bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Collections for storing data
client.commands = new Collection();
client.activeReviews = new Collection(); // Store active review sessions


// Helper function to check if user is admin
const isAdmin = async (interaction) => {
    const settings = await getSettings(interaction.guild.id);
    
    // Check if user has administrator permission or manage_guild permission using memberPermissions
    if (interaction.memberPermissions && (
        interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator) || 
        interaction.memberPermissions.has(PermissionsBitField.Flags.ManageGuild)
    )) {
        return true;
    }
    
    // Check custom admin roles if configured
    const adminRoles = JSON.parse(settings.admin_roles || '[]');
    if (adminRoles.length > 0) {
        // Handle different member types based on whether guild is cached
        if (interaction.member) {
            if (interaction.member.roles && interaction.member.roles.cache) {
                // Cached guild member
                return adminRoles.some(roleId => interaction.member.roles.cache.has(roleId));
            } else if (Array.isArray(interaction.member.roles)) {
                // API interaction guild member (uncached)
                return adminRoles.some(roleId => interaction.member.roles.includes(roleId));
            }
        }
    }
    
    return false;
};

// Slash commands
const commands = [
    {
        name: 'reviewmenu',
        description: 'Opens the review menu for customers to leave reviews'
    },
    {
        name: 'setreviewchannel',
        description: 'Set the channel where reviews will be sent (Admin only)',
        options: [{
            name: 'channel',
            description: 'The channel to send reviews to',
            type: 7, // CHANNEL type
            required: true
        }]
    },
    {
        name: 'adminconfig',
        description: 'Configure the review system (Admin only)'
    }
];

// Review steps enum
const ReviewSteps = {
    RATING: 'rating',
    COMMENT: 'comment',
    PRODUCT: 'product',
    COMPLETE: 'complete'
};

// Create review menu embed
const createReviewEmbed = async (guildId, step = ReviewSteps.RATING, reviewData = {}) => {
    const settings = await getSettings(guildId);
    
    const embed = new EmbedBuilder()
        .setColor(settings.embed_color)
        .setTitle(settings.embed_title)
        .setTimestamp();

    switch (step) {
        case ReviewSteps.RATING:
            embed.setDescription(`**Step 1 of 3:** Please select your rating\n\n${settings.embed_description}`);
            break;
        case ReviewSteps.COMMENT:
            embed.setDescription(`**Step 2 of 3:** Leave your comment\n\n★ **Rating:** ${reviewData.rating} star${reviewData.rating !== 1 ? 's' : ''}\n\nPlease click the button below to leave your detailed comment.`);
            break;
        case ReviewSteps.PRODUCT:
            embed.setDescription(`**Step 3 of 3:** Select the product/item\n\n★ **Rating:** ${reviewData.rating} star${reviewData.rating !== 1 ? 's' : ''}\n💬 **Comment:** ${reviewData.comment.length > 100 ? reviewData.comment.substring(0, 100) + '...' : reviewData.comment}\n\nPlease select the product/item you purchased.`);
            break;
        case ReviewSteps.COMPLETE:
            embed.setDescription(`✅ **Review Complete!**\n\n★ **Rating:** ${reviewData.rating} star${reviewData.rating !== 1 ? 's' : ''}\n💬 **Comment:** ${reviewData.comment}\n📦 **Product:** ${reviewData.product}\n\nThank you for your review! It has been submitted.`);
            embed.setColor('#27ae60'); // Green color for success
            break;
    }

    return embed;
};

// Create action rows for different steps
const createActionRow = async (guildId, step) => {
    const settings = await getSettings(guildId);
    
    switch (step) {
        case ReviewSteps.RATING:
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('rating_1')
                        .setLabel('1 Star')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('rating_2')
                        .setLabel('2 Stars')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('rating_3')
                        .setLabel('3 Stars')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('rating_4')
                        .setLabel('4 Stars')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('rating_5')
                        .setLabel('5 Stars')
                        .setStyle(ButtonStyle.Primary)
                );
        
        case ReviewSteps.COMMENT:
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('leave_comment')
                        .setLabel('Leave Comment')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('💬')
                );
        
        case ReviewSteps.PRODUCT:
            const products = JSON.parse(settings.products || '[]');
            if (!products || products.length === 0) {
                return new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('no_products')
                            .setLabel('No Products Configured')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
            }
            
            const options = products.slice(0, 25).map((product, index) => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(product)
                    .setValue(`product_${index}`)
                    .setDescription(`Select ${product}`)
            );
            
            return new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_product')
                        .setPlaceholder('Choose a product/item')
                        .addOptions(options)
                );
        
        default:
            return null;
    }
};

// Bot ready event
client.once('ready', async () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    
    // Initialize database
    await initDatabase();
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
});

// Interaction handling
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        }
    }
});

// Handle slash commands
const handleSlashCommand = async (interaction) => {
    const { commandName } = interaction;
    
    switch (commandName) {
        case 'reviewmenu':
            const embed = await createReviewEmbed(interaction.guild.id, ReviewSteps.RATING);
            const actionRow = await createActionRow(interaction.guild.id, ReviewSteps.RATING);
            
            await interaction.reply({
                embeds: [embed],
                components: [actionRow],
                ephemeral: true
            });
            break;
            
        case 'setreviewchannel':
            if (!(await isAdmin(interaction))) {
                return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }
            
            const channel = interaction.options.getChannel('channel');
            if (!channel.isTextBased()) {
                return interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
            }
            
            await updateSettings(interaction.guild.id, {
                review_channel_id: channel.id
            });
            
            await interaction.reply({ content: `Review channel has been set to ${channel}`, ephemeral: true });
            break;
            
        case 'adminconfig':
            if (!(await isAdmin(interaction))) {
                return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }
            
            const configEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('Admin Configuration')
                .setDescription('Click the buttons below to configure the review system.');
            
            const configRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_embed')
                        .setLabel('Embed Settings')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('config_products')
                        .setLabel('Manage Products')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.reply({
                embeds: [configEmbed],
                components: [configRow],
                ephemeral: true
            });
            break;
    }
};

// Handle button interactions
const handleButtonInteraction = async (interaction) => {
    const customId = interaction.customId;
    
    if (customId.startsWith('rating_')) {
        const rating = parseInt(customId.split('_')[1]);
        const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
        
        // Store rating in active review session
        if (!client.activeReviews.has(sessionKey)) {
            client.activeReviews.set(sessionKey, {});
        }
        client.activeReviews.get(sessionKey).rating = rating;
        client.activeReviews.get(sessionKey).guildId = interaction.guild.id;
        client.activeReviews.get(sessionKey).userName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
        
        // Update embed to comment step
        const embed = await createReviewEmbed(interaction.guild.id, ReviewSteps.COMMENT, { rating });
        const actionRow = await createActionRow(interaction.guild.id, ReviewSteps.COMMENT);
        
        await interaction.update({
            embeds: [embed],
            components: [actionRow]
        });
    }
    
    if (customId === 'leave_comment') {
        const modal = new ModalBuilder()
            .setCustomId('comment_modal')
            .setTitle('Leave Your Comment');
        
        const commentInput = new TextInputBuilder()
            .setCustomId('comment_text')
            .setLabel('Your detailed comment')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(10)
            .setMaxLength(1000)
            .setPlaceholder('Please share your detailed experience...')
            .setRequired(true);
        
        const firstActionRow = new ActionRowBuilder().addComponents(commentInput);
        modal.addComponents(firstActionRow);
        
        await interaction.showModal(modal);
    }
    
    // Admin configuration buttons
    if (customId === 'config_embed') {
        const modal = new ModalBuilder()
            .setCustomId('embed_config_modal')
            .setTitle('Configure Embed Settings');
        
        const settings = await getSettings(interaction.guild.id);
        
        const titleInput = new TextInputBuilder()
            .setCustomId('embed_title')
            .setLabel('Embed Title')
            .setStyle(TextInputStyle.Short)
            .setValue(settings.embed_title)
            .setMaxLength(256)
            .setRequired(true);
        
        const descInput = new TextInputBuilder()
            .setCustomId('embed_description')
            .setLabel('Embed Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(settings.embed_description)
            .setMaxLength(1000)
            .setRequired(true);
        
        const colorInput = new TextInputBuilder()
            .setCustomId('embed_color')
            .setLabel('Embed Color (Hex)')
            .setStyle(TextInputStyle.Short)
            .setValue(settings.embed_color)
            .setPlaceholder('#3498db')
            .setRequired(true);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(colorInput)
        );
        
        await interaction.showModal(modal);
    }
    
    if (customId === 'config_products') {
        const modal = new ModalBuilder()
            .setCustomId('products_config_modal')
            .setTitle('Configure Products/Items');
        
        const settings = await getSettings(interaction.guild.id);
        const products = JSON.parse(settings.products || '[]');
        
        const productsInput = new TextInputBuilder()
            .setCustomId('products_list')
            .setLabel('Products/Items (one per line)')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(products.join('\n'))
            .setPlaceholder('Product 1\nProduct 2\nProduct 3')
            .setMaxLength(2000)
            .setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(productsInput));
        
        await interaction.showModal(modal);
    }
};

// Handle select menu interactions
const handleSelectMenuInteraction = async (interaction) => {
    if (interaction.customId === 'select_product') {
        const selectedValue = interaction.values[0];
        const productIndex = parseInt(selectedValue.split('_')[1]);
        const settings = await getSettings(interaction.guild.id);
        const products = JSON.parse(settings.products || '[]');
        const product = products[productIndex];
        
        const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
        const reviewData = client.activeReviews.get(sessionKey);
        
        if (!reviewData) {
            return interaction.reply({ content: 'Review session expired. Please start over with /reviewmenu', ephemeral: true });
        }
        
        reviewData.product = product;
        
        // Submit the review
        await submitReview(interaction, reviewData);
        
        // Clean up active review
        client.activeReviews.delete(sessionKey);
    }
};

// Handle modal submissions
const handleModalSubmit = async (interaction) => {
    if (interaction.customId === 'comment_modal') {
        const comment = interaction.fields.getTextInputValue('comment_text');
        const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
        const reviewData = client.activeReviews.get(sessionKey);
        
        if (!reviewData) {
            return interaction.reply({ content: 'Review session expired. Please start over with /reviewmenu', ephemeral: true });
        }
        
        reviewData.comment = comment;
        
        // Reply to modal with product selection step
        const embed = await createReviewEmbed(interaction.guild.id, ReviewSteps.PRODUCT, reviewData);
        const actionRow = await createActionRow(interaction.guild.id, ReviewSteps.PRODUCT);
        
        await interaction.reply({
            embeds: [embed],
            components: actionRow ? [actionRow] : [],
            ephemeral: true
        });
    }
    
    if (interaction.customId === 'embed_config_modal') {
        const title = interaction.fields.getTextInputValue('embed_title');
        const description = interaction.fields.getTextInputValue('embed_description');
        const color = interaction.fields.getTextInputValue('embed_color');
        
        // Validate hex color
        const hexPattern = /^#([0-9A-F]{3}){1,2}$/i;
        if (!hexPattern.test(color)) {
            return interaction.reply({ content: 'Invalid hex color format. Please use format like #3498db', ephemeral: true });
        }
        
        await updateSettings(interaction.guild.id, {
            embed_title: title,
            embed_description: description,
            embed_color: color
        });
        
        await interaction.reply({ content: 'Embed settings have been updated successfully!', ephemeral: true });
    }
    
    if (interaction.customId === 'products_config_modal') {
        const productsText = interaction.fields.getTextInputValue('products_list');
        const products = productsText.split('\n').filter(p => p.trim()).map(p => p.trim());
        
        if (products.length === 0) {
            return interaction.reply({ content: 'Please provide at least one product/item.', ephemeral: true });
        }
        
        if (products.length > 25) {
            return interaction.reply({ content: 'Maximum 25 products allowed due to Discord limitations.', ephemeral: true });
        }
        
        await updateSettings(interaction.guild.id, {
            products: JSON.stringify(products)
        });
        
        await interaction.reply({ content: `Successfully updated product list with ${products.length} items!`, ephemeral: true });
    }
};

// Submit review function
const submitReview = async (interaction, reviewData) => {
    try {
        // Save review to database
        const review = await saveReview({
            userId: interaction.user.id,
            userName: reviewData.userName,
            guildId: reviewData.guildId,
            rating: reviewData.rating,
            comment: reviewData.comment,
            product: reviewData.product
        });
        
        // Get settings for review channel
        const settings = await getSettings(interaction.guild.id);
        
        if (settings && settings.review_channel_id) {
            const reviewChannel = await client.channels.fetch(settings.review_channel_id);
            
            if (reviewChannel) {
                const stars = '★'.repeat(reviewData.rating) + '☆'.repeat(5 - reviewData.rating);
                
                const reviewEmbed = new EmbedBuilder()
                    .setColor(settings.embed_color)
                    .setTitle('New Review Submitted')
                    .setDescription(`**Customer:** ${reviewData.userName}\n**Rating:** ${stars} (${reviewData.rating}/5)\n**Product:** ${reviewData.product}\n**Comment:** ${reviewData.comment}`)
                    .setTimestamp()
                    .setFooter({ text: `Review ID: ${review.id}` });
                
                await reviewChannel.send({ 
                    embeds: [reviewEmbed], 
                    allowedMentions: { parse: [] } 
                });
            }
        }
        
        // Update interaction with completion message
        const completionEmbed = await createReviewEmbed(interaction.guild.id, ReviewSteps.COMPLETE, reviewData);
        
        await interaction.update({
            embeds: [completionEmbed],
            components: []
        });
        
    } catch (error) {
        console.error('Error submitting review:', error);
        await interaction.followUp({ content: 'There was an error submitting your review. Please try again later.', ephemeral: true });
    }
};

// Error handling
client.on('error', console.error);
client.on('warn', console.warn);

// Login to Discord
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN environment variable is required');
    process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);