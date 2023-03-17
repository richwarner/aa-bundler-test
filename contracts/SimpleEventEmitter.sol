// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract SimpleEventEmitter {
    // Define the event
    event ParameterEmitted(bytes parameter);

    // Function to emit the event
    function emitEvent(bytes memory parameter) public {
        emit ParameterEmitted(parameter);
    }
}