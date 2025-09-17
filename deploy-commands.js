const { REST, Routes } = require('discord.js');
require('dotenv').config();  // Make sure to load environment variables

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID; 

const commands = [
    {
        name: 'reviewmenu',
        description: 'Opens the review menu for customers to leave reviews',
    },
    {
        name: 'setreviewchannel',
        description: 'Set the channel where reviews will be sent (Admin only)',
        options: [{
            name: 'channel',
            description: 'The channel to send reviews to',
            type: 7,  
            required: true,
        }],
    },
    {
        name: 'adminconfig',
        description: 'Configure the review system (Admin only)',
    }
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(clientId),  
            { body: commands }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();
